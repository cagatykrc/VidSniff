import {
  BrowserWindow,
  BrowserView,
  session,
  ipcMain,
} from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isLikelyMedia,
  classifyMedia,
  detectHlsKind,
  guessFilename,
  mediaKey,
  displayLabel,
  isPrimaryCandidate,
  scoreItem,
  streamPathKey,
} from "../extension/lib/media.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PARTITION = "persist:vidsniff-browser";
const CHROME_H = 56;
const JOBS_PANEL_W = 372;
let jobsPanelOpen = false;
const DOWNLOADER = "http://127.0.0.1:17890";
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const STEALTH_JS = `(() => {
  try {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = window.chrome || { runtime: {}, app: { isInstalled: false } };
    Object.defineProperty(navigator, 'languages', { get: () => ['tr-TR', 'tr', 'en-US', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  } catch (_) {}
})();`;

/** @type {BrowserWindow | null} */
let win = null;
/** @type {BrowserView | null} */
let view = null;
/** @type {Map<string, object>} */
const items = new Map();
/** @type {Map<string, object>} */
const pending = new Map();
/** @type {Map<string, string>} */
const cookiesByKey = new Map();
let sniffAttached = false;
let ipcReady = false;

/**
 * @param {{
 *   icon: string,
 *   getStrings: () => Record<string,string>,
 *   getLang: () => string,
 *   openSettings?: () => void,
 *   openFolder?: () => void,
 *   showInFolder?: (p: string) => void,
 * }} opts
 */
export function showBrowser(opts) {
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
    pushPrimary();
    return win;
  }

  ensureSniff();
  ensureIpc(opts);

  win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 720,
    minHeight: 520,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#12141a",
    icon: opts.icon,
    title: "VidSniff",
    webPreferences: {
      preload: path.join(__dirname, "preload-browser.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  view = new BrowserView({
    webPreferences: {
      session: session.fromPartition(PARTITION),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, "preload-stealth.cjs"),
    },
  });
  win.setBrowserView(view);
  view.webContents.setUserAgent(CHROME_UA);
  layoutView();

  win.on("resize", () => layoutView());
  win.on("closed", () => {
    win = null;
    view = null;
  });

  const wc = view.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) wc.loadURL(url);
    return { action: "deny" };
  });
  const injectStealth = () => {
    wc.executeJavaScript(STEALTH_JS, true).catch(() => {});
  };
  wc.on("dom-ready", injectStealth);
  wc.on("did-navigate", (_e, url) => {
    injectStealth();
    syncNav(url);
  });
  wc.on("did-navigate-in-page", (_e, url) => syncNav(url));
  wc.on("page-title-updated", (_e, title) => {
    if (win && !win.isDestroyed()) win.setTitle(`${title} — VidSniff`);
    pushPrimary();
  });
  wc.on("did-start-loading", () => sendToolbar({ type: "loading", loading: true }));
  wc.on("did-stop-loading", () => {
    sendToolbar({ type: "loading", loading: false });
    syncNav(wc.getURL());
  });

  win.loadFile(path.join(__dirname, "browser.html"));
  win.once("ready-to-show", () => {
    win.show();
    const strings = opts.getStrings?.() || {};
    sendToolbar({ type: "i18n", strings, lang: opts.getLang?.() || "tr" });
    pushPrimary();
  });
  win.webContents.on("did-finish-load", () => {
    const strings = opts.getStrings?.() || {};
    sendToolbar({ type: "i18n", strings, lang: opts.getLang?.() || "tr" });
    pushPrimary();
    syncNav(view?.webContents?.getURL?.() || "");
  });

  wc.loadURL("https://www.google.com/");
  return win;
}

export function closeBrowser() {
  if (win && !win.isDestroyed()) win.close();
}

export function pushBrowserI18n(strings, lang) {
  sendToolbar({ type: "i18n", strings: strings || {}, lang: lang || "tr" });
}

function layoutView() {
  if (!win || win.isDestroyed() || !view) return;
  const [w, h] = win.getContentSize();
  const top = CHROME_H;
  // Açık indirme paneli BrowserView altında kalmasın diye sağda boşluk bırak
  const rightGap = jobsPanelOpen ? JOBS_PANEL_W : 0;
  view.setBounds({
    x: 0,
    y: top,
    width: Math.max(0, w - rightGap),
    height: Math.max(0, h - top),
  });
  view.setAutoResize({ width: true, height: true });
}

function sendToolbar(payload) {
  if (win && !win.isDestroyed()) {
    win.webContents.send("browser:event", payload);
  }
}

function syncNav(url) {
  if (!view) return;
  const wc = view.webContents;
  let canBack = false;
  let canForward = false;
  try {
    canBack = wc.navigationHistory?.canGoBack?.() ?? wc.canGoBack?.() ?? false;
    canForward = wc.navigationHistory?.canGoForward?.() ?? wc.canGoForward?.() ?? false;
  } catch {
    /* ignore */
  }
  sendToolbar({
    type: "nav",
    url: url || "",
    canBack: !!canBack,
    canForward: !!canForward,
    title: wc.getTitle() || "",
  });
}

function ensureSniff() {
  if (sniffAttached) return;
  sniffAttached = true;
  const ses = session.fromPartition(PARTITION);
  ses.setUserAgent(CHROME_UA);

  ses.webRequest.onBeforeSendHeaders({ urls: ["*://*/*"] }, (details, callback) => {
    if (details.resourceType === "mainFrame" || details.resourceType === "subFrame") {
      // keep
    }
    const headers = {};
    const raw = details.requestHeaders || {};
    for (const [k, v] of Object.entries(raw)) {
      const name = k.toLowerCase();
      if (
        name === "referer" ||
        name === "origin" ||
        name === "cookie" ||
        name === "authorization" ||
        name === "user-agent" ||
        name === "accept" ||
        name === "accept-language" ||
        name === "range"
      ) {
        headers[name] = Array.isArray(v) ? v.join(",") : String(v || "");
      }
    }
    pending.set(details.id, { url: details.url, headers, ts: Date.now() });
    if (pending.size > 600) {
      const cutoff = Date.now() - 120_000;
      for (const [id, v] of pending) {
        if (v.ts < cutoff) pending.delete(id);
      }
    }
    callback({ requestHeaders: details.requestHeaders });
  });

  ses.webRequest.onCompleted({ urls: ["*://*/*"] }, (details) => {
    if (details.method && details.method !== "GET" && details.method !== "HEAD") {
      pending.delete(details.id);
      return;
    }
    if (![200, 206].includes(details.statusCode)) {
      pending.delete(details.id);
      return;
    }

    const responseHeaders = {};
    for (const [k, v] of Object.entries(details.responseHeaders || {})) {
      responseHeaders[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
    }
    const contentType = responseHeaders["content-type"] || "";
    const contentLength = Number(responseHeaders["content-length"] || 0);

    if (!isLikelyMedia(details.url, contentType, contentLength)) {
      pending.delete(details.id);
      return;
    }

    const type = classifyMedia(details.url, contentType);
    if (type === "segment") {
      pending.delete(details.id);
      return;
    }

    const req = pending.get(details.id) || { headers: {} };
    pending.delete(details.id);
    const key = mediaKey(details.url);
    if (req.headers?.cookie) cookiesByKey.set(key, req.headers.cookie);

    const pageTitle = view && !view.webContents.isDestroyed() ? view.webContents.getTitle() : "";
    const hlsKind = type === "hls" ? detectHlsKind(details.url, contentLength) : "";
    const prev = items.get(key);
    const item = {
      id: key,
      url: details.url,
      type,
      hlsKind,
      contentType,
      size: Math.max(contentLength || 0, prev?.size || 0),
      filename: guessFilename(details.url, contentType, pageTitle),
      pageTitle,
      source: "network",
      requestHeaders: { ...(prev?.requestHeaders || {}), ...(req.headers || {}) },
      statusCode: details.statusCode,
      seenAt: Date.now(),
      displayName: "",
    };
    item.displayName = displayLabel(item);
    items.set(key, item);

    if (items.size > 80) {
      const sorted = [...items.entries()].sort((a, b) => (a[1].seenAt || 0) - (b[1].seenAt || 0));
      while (items.size > 80) {
        const [oldKey] = sorted.shift();
        items.delete(oldKey);
      }
    }
    pushPrimary();
  });

  ses.webRequest.onErrorOccurred({ urls: ["*://*/*"] }, (details) => {
    pending.delete(details.id);
  });
}

function pickPrimary() {
  const list = [...items.values()].filter((i) => isPrimaryCandidate(i));
  if (!list.length) return null;
  const masters = list.filter(
    (i) => i.type === "hls" && (i.hlsKind === "master" || /master\.(txt|m3u8)/i.test(i.url || ""))
  );
  if (masters.length) {
    masters.sort((a, b) => (b.seenAt || 0) - (a.seenAt || 0) || scoreItem(b) - scoreItem(a));
    const best = masters[0];
    const family = streamPathKey(best.url);
    const fresh =
      masters
        .filter((m) => streamPathKey(m.url) === family)
        .sort((a, b) => (b.seenAt || 0) - (a.seenAt || 0))[0] || best;
    return { ...fresh, displayName: displayLabel(fresh) };
  }
  list.sort((a, b) => scoreItem(b) - scoreItem(a) || (b.seenAt || 0) - (a.seenAt || 0));
  const top = list[0];
  return { ...top, displayName: displayLabel(top) };
}

function collectAudioUrls(primary) {
  if (!primary) return [];
  const out = [];
  for (const it of items.values()) {
    const u = it.url || "";
    if (/sublist_aud|\/aud\d|\baudio\b|TYPE=AUDIO/i.test(u) || it.hlsKind === "audio") {
      out.push(u);
    }
  }
  return out;
}

function pushPrimary() {
  const primary = pickPrimary();
  sendToolbar({
    type: "primary",
    item: primary
      ? {
          url: primary.url,
          type: primary.type,
          hlsKind: primary.hlsKind,
          displayName: primary.displayName || primary.filename,
          filename: primary.filename,
          contentType: primary.contentType,
          size: primary.size,
        }
      : null,
  });
}

function ensureIpc(opts) {
  if (ipcReady) return;
  ipcReady = true;

  ipcMain.handle("browser:navigate", (_e, raw) => {
    if (!view) return { ok: false };
    let url = String(raw || "").trim();
    if (!url) return { ok: false };
    if (!/^https?:\/\//i.test(url) && !/^about:/i.test(url)) {
      if (/^[\w.-]+\.[a-z]{2,}([/:].*)?$/i.test(url)) url = `https://${url}`;
      else url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
    }
    view.webContents.loadURL(url);
    return { ok: true, url };
  });

  ipcMain.handle("browser:back", () => {
    if (view?.webContents.canGoBack()) view.webContents.goBack();
    return true;
  });
  ipcMain.handle("browser:forward", () => {
    if (view?.webContents.canGoForward()) view.webContents.goForward();
    return true;
  });
  ipcMain.handle("browser:reload", () => {
    view?.webContents.reload();
    return true;
  });
  ipcMain.handle("browser:stop", () => {
    view?.webContents.stop();
    return true;
  });

  ipcMain.handle("browser:getPrimary", () => pickPrimary());

  ipcMain.handle("browser:probe", async (_e, payload = {}) => {
    const primary = pickPrimary();
    const url = payload.url || primary?.url;
    if (!url) return { ok: false, error: "URL yok" };
    const item = [...items.values()].find((i) => i.url === url) || primary || { url };
    const headers = await buildHeaders(item);
    try {
      const res = await fetch(`${DOWNLOADER}/probe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, headers }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error || "probe başarısız" };
      return { ok: true, ...data };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  ipcMain.handle("browser:download", async (_e, payload = {}) => {
    let item = pickPrimary();
    if (payload.url && item?.url !== payload.url) {
      const found = [...items.values()].find((i) => i.url === payload.url);
      if (found) item = found;
    }
    if (!item?.url) {
      return { ok: false, error: opts.getStrings?.()?.browserPlayFirst || "Önce videoyu oynat" };
    }
    const headers = await buildHeaders(item);
    const quality = payload.quality || "auto";
    const audioUrls = collectAudioUrls(item);
    try {
      const res = await fetch(`${DOWNLOADER}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: item.url,
          type: item.type === "video" && /\/hls\//i.test(item.url) ? "hls" : item.type,
          filename: item.displayName || item.filename,
          headers,
          quality,
          audioUrls,
          estimatedBytes: payload.estimatedBytes || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error || "indirme başarısız" };
      return { ok: true, jobId: data.id, job: data };
    } catch (e) {
      return {
        ok: false,
        error: e?.message || String(e) || "Yerel servis kapalı",
      };
    }
  });

  ipcMain.handle("browser:job", async (_e, jobId) => {
    if (!jobId) return null;
    try {
      const res = await fetch(`${DOWNLOADER}/jobs/${jobId}`);
      return await res.json();
    } catch {
      return null;
    }
  });

  ipcMain.handle("browser:clearCaptures", () => {
    items.clear();
    pushPrimary();
    return true;
  });

  ipcMain.handle("browser:openFolder", () => {
    opts.openFolder?.();
    return true;
  });
  ipcMain.handle("browser:openSettings", () => {
    opts.openSettings?.();
    return true;
  });
  ipcMain.handle("browser:showInFolder", (_e, filePath) => {
    if (filePath) opts.showInFolder?.(filePath);
    return true;
  });
  ipcMain.handle("browser:setJobsOpen", (_e, open) => {
    jobsPanelOpen = !!open;
    layoutView();
    return true;
  });
}

async function buildHeaders(item) {
  const headers = { ...(item?.requestHeaders || {}) };
  const key = mediaKey(item?.url || "");
  if (cookiesByKey.has(key)) headers.cookie = cookiesByKey.get(key);

  try {
    const ses = session.fromPartition(PARTITION);
    const pageUrl = view?.webContents?.getURL?.() || "";
    const list = await ses.cookies.get({ url: item.url });
    const pageCookies = pageUrl ? await ses.cookies.get({ url: pageUrl }) : [];
    const map = new Map();
    for (const c of [...pageCookies, ...list]) map.set(c.name, c.value);
    if (map.size) {
      const jar = [...map.entries()].map(([n, v]) => `${n}=${v}`).join("; ");
      headers.cookie = headers.cookie ? `${headers.cookie}; ${jar}` : jar;
    }
    if (!headers.referer && pageUrl && /^https?:/i.test(pageUrl)) {
      headers.referer = pageUrl;
      try {
        headers.origin = new URL(pageUrl).origin;
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }

  if (!headers["user-agent"]) headers["user-agent"] = CHROME_UA;
  if (!headers.accept) headers.accept = "*/*";
  return headers;
}
