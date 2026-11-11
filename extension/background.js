import {
  isLikelyMedia,
  classifyMedia,
  guessFilename,
  mediaKey,
  formatBytes,
  pickHeader,
  detectHlsKind,
  displayLabel,
} from "./lib/media.js";

const MAX_ITEMS = 80;
const DOWNLOADER_URL = "http://127.0.0.1:17890";

/** @type {Map<string, object>} */
const items = new Map();
/** requestId → request headers */
const pendingRequests = new Map();
/** mediaKey → yakalanan Cookie (storage'a yazılmaz) */
const capturedCookies = new Map();
/** tabId → { frameId, area, ts } */
const panelLeaders = new Map();
/** tabId → kapalı */
const panelClosedTabs = new Set();
/** tabId → elect timer */
const panelElectTimers = new Map();
let downloaderOnline = false;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ items: [] });
});

// IDM gibi: giden isteğin Referer / Cookie / Authorization bilgisini sakla
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (details.tabId < 0) return;
    const headers = {};
    for (const h of details.requestHeaders || []) {
      const name = (h.name || "").toLowerCase();
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
        headers[name] = h.value || "";
      }
    }
    pendingRequests.set(details.requestId, {
      url: details.url,
      tabId: details.tabId,
      headers,
      ts: Date.now(),
    });
    // bellek temizliği
    if (pendingRequests.size > 500) {
      const cutoff = Date.now() - 120_000;
      for (const [id, v] of pendingRequests) {
        if (v.ts < cutoff) pendingRequests.delete(id);
      }
    }
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders"]
);

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.tabId < 0) return;
    if (details.method && details.method !== "GET" && details.method !== "HEAD") return;
    if (![200, 206].includes(details.statusCode)) {
      pendingRequests.delete(details.requestId);
      return;
    }

    const responseHeaders = Object.fromEntries(
      (details.responseHeaders || []).map((h) => [h.name.toLowerCase(), h.value || ""])
    );
    const contentType = responseHeaders["content-type"] || "";
    const contentLength = Number(responseHeaders["content-length"] || 0);

    if (!isLikelyMedia(details.url, contentType, contentLength)) {
      pendingRequests.delete(details.requestId);
      return;
    }

    const type = classifyMedia(details.url, contentType);
    if (type === "segment") {
      pendingRequests.delete(details.requestId);
      return;
    }

    const pending = pendingRequests.get(details.requestId);
    pendingRequests.delete(details.requestId);
    const reqHeaders = pending?.headers || {};
    const key = mediaKey(details.url);
    if (reqHeaders.cookie) capturedCookies.set(key, reqHeaders.cookie);

    const hlsKind = type === "hls" ? detectHlsKind(details.url, contentLength) : "";

    const finish = (pageTitle = "") => {
      upsertItem({
        url: details.url,
        tabId: details.tabId,
        type,
        hlsKind,
        contentType,
        size: contentLength || 0,
        filename: guessFilename(details.url, contentType, pageTitle),
        pageTitle,
        source: "network",
        initiator: details.initiator || details.originUrl || "",
        requestHeaders: reqHeaders,
        statusCode: details.statusCode,
      });
    };

    chrome.tabs.get(details.tabId).then((tab) => finish(tab?.title || "")).catch(() => finish(""));
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

chrome.webRequest.onErrorOccurred.addListener((details) => {
  pendingRequests.delete(details.requestId);
}, { urls: ["<all_urls>"] });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === "DOM_MEDIA") {
      const tabId = sender.tab?.id ?? -1;
      const pageUrl = sender.tab?.url || msg.pageUrl || "";
      for (const m of msg.media || []) {
        if (!m?.url || !isLikelyMedia(m.url, m.contentType || "", m.size || 0)) continue;
        const headers = {};
        if (pageUrl) {
          headers.referer = pageUrl;
          try {
            headers.origin = new URL(pageUrl).origin;
          } catch {
            /* ignore */
          }
        }
        upsertItem({
          url: m.url,
          tabId,
          type: classifyMedia(m.url, m.contentType || ""),
          contentType: m.contentType || "",
          size: m.size || 0,
          filename: guessFilename(m.url, m.contentType || ""),
          source: "dom",
          pageTitle: m.pageTitle || "",
          requestHeaders: headers,
        });
      }
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "GET_ITEMS") {
      const list = await getItemsForTab(msg.tabId);
      const status = await pingDownloader();
      sendResponse({ items: list, downloaderOnline: status });
      return;
    }

    if (msg?.type === "GET_PRIMARY") {
      const tabId = msg.tabId ?? sender.tab?.id ?? (await activeTabIdSafe());
      const primary = pickPrimaryForTab(tabId);
      sendResponse({
        item: primary,
        downloaderOnline: await pingDownloader(),
      });
      return;
    }

    if (msg?.type === "PANEL_CANDIDATE") {
      const tabId = sender.tab?.id;
      const frameId = sender.frameId ?? 0;
      if (tabId != null && !panelClosedTabs.has(tabId)) {
        notePanelCandidate(tabId, frameId, Number(msg.area) || 0);
      }
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "PANEL_CLOSE") {
      const tabId = sender.tab?.id;
      if (tabId != null) {
        panelClosedTabs.add(tabId);
        panelLeaders.delete(tabId);
        hideAllPanels(tabId);
      }
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "PANEL_CLOSED_LOCAL") {
      const tabId = sender.tab?.id;
      if (tabId != null) panelClosedTabs.add(tabId);
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "PANEL_NAVIGATE") {
      const tabId = sender.tab?.id;
      if (tabId != null) {
        // yeni film: X kapamasını, lideri ve eski medya listesini sıfırla
        panelClosedTabs.delete(tabId);
        panelLeaders.delete(tabId);
        for (const [k, v] of [...items.entries()]) {
          if (v.tabId === tabId) items.delete(k);
        }
        persist();
        updateBadge();
        schedulePanelElect(tabId);
      }
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "CLEAR") {
      if (msg.tabId != null) {
        for (const [k, v] of [...items.entries()]) {
          if (v.tabId === msg.tabId) items.delete(k);
        }
      } else {
        items.clear();
      }
      await persist();
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "PROBE") {
      const item = [...items.values()].find((i) => i.url === msg.url) || { url: msg.url };
      const headers = await buildDownloadHeaders(item);
      const result = await probeItem(msg.url, headers);
      sendResponse(result);
      return;
    }

    if (msg?.type === "DOWNLOAD") {
      const item = {
        ...(msg.item || {}),
        estimatedBytes: msg.estimatedBytes ?? msg.item?.estimatedBytes,
      };
      const result = await downloadItem(item, msg.mode || "auto", msg.quality || "auto");
      sendResponse(result);
      return;
    }

    if (msg?.type === "JOB_STATUS") {
      try {
        const res = await fetch(`${DOWNLOADER_URL}/jobs/${msg.jobId}`);
        sendResponse(await res.json());
      } catch (e) {
        sendResponse({ error: e?.message || String(e) });
      }
      return;
    }

    if (msg?.type === "LIST_JOBS") {
      sendResponse(await listJobs());
      return;
    }

    if (msg?.type === "OPEN_DOWNLOADS_FOLDER") {
      try {
        const res = await fetch(`${DOWNLOADER_URL}/health`);
        const data = await res.json();
        if (data.downloadDir) {
          // Zen/Firefox: dosya yöneticisini doğrudan açamayız; path'i döndür
          sendResponse({ ok: true, path: data.downloadDir });
        } else {
          sendResponse({ ok: false, error: "klasör yok" });
        }
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || String(e) });
      }
    }
  })();
  return true;
});

async function listJobs() {
  try {
    const res = await fetch(`${DOWNLOADER_URL}/jobs`);
    const data = await res.json();
    const jobs = data.jobs || [];
    await chrome.storage.local.set({ lastJobs: jobs });
    updateDownloadBadge(jobs);
    return { ok: true, jobs, downloaderOnline: true };
  } catch (e) {
    const stored = await chrome.storage.local.get("lastJobs");
    return {
      ok: false,
      jobs: stored.lastJobs || [],
      downloaderOnline: false,
      error: e?.message || String(e),
    };
  }
}

function updateDownloadBadge(jobs) {
  const running = (jobs || []).filter((j) => j.status === "running");
  if (running.length) {
    const pct = Math.round(
      running.reduce((s, j) => s + (j.progress || 0), 0) / running.length
    );
    chrome.action.setBadgeBackgroundColor({ color: "#0d9488" });
    chrome.action.setBadgeText({ text: `${pct}%` });
    return;
  }
  // medya sayısına dön
  updateBadge();
}

// Popup kapalıyken de ilerlemeyi rozete yaz
setInterval(() => {
  listJobs().catch(() => {});
}, 2000);

chrome.tabs.onRemoved.addListener((tabId) => {
  for (const [k, v] of [...items.entries()]) {
    if (v.tabId === tabId) items.delete(k);
  }
  clearPanelState(tabId);
  persist();
  updateBadge();
});

// Yeni filme / URL'ye geçince paneli tekrar açılabilir yap
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading" && info.url) {
    clearPanelState(tabId);
  }
  if (info.status === "complete") {
    // içerik scriptleri aday bildirsin diye biraz bekle
    setTimeout(() => schedulePanelElect(tabId), 800);
  }
});

function clearPanelState(tabId) {
  panelLeaders.delete(tabId);
  panelClosedTabs.delete(tabId);
  const t = panelElectTimers.get(tabId);
  if (t) clearTimeout(t);
  panelElectTimers.delete(tabId);
}

function notePanelCandidate(tabId, frameId, area) {
  if (area <= 0) {
    const cur = panelLeaders.get(tabId);
    if (cur?.frameId === frameId) {
      // bu frame artık video göstermiyor; yeniden seç
      panelLeaders.delete(tabId);
      schedulePanelElect(tabId);
    }
    return;
  }
  const cur = panelLeaders.get(tabId);
  if (!cur || area > cur.area + 500 || (area >= cur.area * 0.95 && frameId === cur.frameId)) {
    panelLeaders.set(tabId, { frameId, area, ts: Date.now() });
  }
  schedulePanelElect(tabId);
}

function schedulePanelElect(tabId) {
  const prev = panelElectTimers.get(tabId);
  if (prev) clearTimeout(prev);
  panelElectTimers.set(
    tabId,
    setTimeout(() => {
      panelElectTimers.delete(tabId);
      electPanel(tabId);
    }, 250)
  );
}

async function electPanel(tabId) {
  if (panelClosedTabs.has(tabId)) {
    hideAllPanels(tabId);
    return;
  }
  const leader = panelLeaders.get(tabId);
  if (!leader || leader.area < 160 * 90) {
    hideAllPanels(tabId);
    return;
  }
  try {
    const frames = await chrome.webNavigation?.getAllFrames?.({ tabId }).catch(() => null);
    const ids = frames?.map((f) => f.frameId) || [0, leader.frameId];
    for (const frameId of new Set(ids)) {
      const msg =
        frameId === leader.frameId
          ? { type: "PANEL_SHOW" }
          : { type: "PANEL_HIDE" };
      chrome.tabs.sendMessage(tabId, msg, { frameId }).catch(() => {});
    }
  } catch {
    chrome.tabs.sendMessage(tabId, { type: "PANEL_SHOW" }, { frameId: leader.frameId }).catch(() => {});
    chrome.tabs.sendMessage(tabId, { type: "PANEL_HIDE" }).catch(() => {});
  }
}

function hideAllPanels(tabId) {
  chrome.tabs.sendMessage(tabId, { type: "PANEL_HIDE" }).catch(() => {});
  chrome.webNavigation?.getAllFrames?.({ tabId }).then((frames) => {
    for (const f of frames || []) {
      chrome.tabs.sendMessage(tabId, { type: "PANEL_HIDE" }, { frameId: f.frameId }).catch(() => {});
    }
  }).catch(() => {});
}

async function upsertItem(partial) {
  const key = mediaKey(partial.url);
  const prev = items.get(key);
  const next = {
    id: key,
    url: partial.url,
    tabId: partial.tabId,
    type: partial.type,
    hlsKind: partial.hlsKind || prev?.hlsKind || "",
    contentType: partial.contentType || prev?.contentType || "",
    size: Math.max(partial.size || 0, prev?.size || 0),
    filename: partial.filename || prev?.filename || "media.bin",
    source: partial.source || prev?.source || "network",
    pageTitle: partial.pageTitle || prev?.pageTitle || "",
    initiator: partial.initiator || prev?.initiator || "",
    requestHeaders: {
      ...(prev?.requestHeaders || {}),
      ...(partial.requestHeaders || {}),
    },
    statusCode: partial.statusCode || prev?.statusCode || 0,
    seenAt: Date.now(),
  };

  items.set(key, next);

  if (items.size > MAX_ITEMS) {
    const sorted = [...items.entries()].sort((a, b) => a[1].seenAt - b[1].seenAt);
    while (items.size > MAX_ITEMS) {
      const [oldKey] = sorted.shift();
      items.delete(oldKey);
    }
  }

  await persist();
  updateBadge();
  notifyPrimary(next.tabId);
}

function notifyPrimary(tabId) {
  if (tabId == null || tabId < 0) return;
  const item = pickPrimaryForTab(tabId);
  chrome.tabs.sendMessage(tabId, { type: "PRIMARY_UPDATED", item }).catch(() => {});
}

function pickPrimaryForTab(tabId) {
  let list = [...items.values()].filter((i) => tabId < 0 || i.tabId === tabId);
  list = list.filter((i) => !isNoiseItem(i));
  if (!list.length) return null;
  list.sort((a, b) => scoreItem(b) - scoreItem(a) || b.seenAt - a.seenAt);
  const top = list[0];
  return {
    ...top,
    displayName: displayLabel(top),
  };
}

function isNoiseItem(it) {
  const u = `${it.url || ""} ${it.filename || ""}`;
  if (/site\.webm|\/logo|sprite|thumbnail|preview/i.test(u)) return true;
  if (/sublist_aud|\/aud\d|\baudio\.m4a\b/i.test(u)) return true;
  if (it.type === "segment") return true;
  return false;
}

async function activeTabIdSafe() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.id ?? -1;
  } catch {
    return -1;
  }
}

async function persist() {
  const list = [...items.values()].sort((a, b) => scoreItem(b) - scoreItem(a) || b.seenAt - a.seenAt);
  // cookie'leri storage'a yazma — sadece referer/origin
  const safe = list.map((it) => ({
    ...it,
    requestHeaders: sanitizeStoredHeaders(it.requestHeaders),
  }));
  await chrome.storage.session?.set?.({ items: safe }).catch(() => {});
  await chrome.storage.local.set({ items: safe });
}

function sanitizeStoredHeaders(h = {}) {
  const out = {};
  for (const k of ["referer", "origin", "user-agent", "accept", "accept-language"]) {
    if (h[k]) out[k] = h[k];
  }
  return out;
}

async function getItemsForTab(tabId) {
  let list = [...items.values()];
  if (!list.length) {
    const stored = await chrome.storage.local.get("items");
    list = stored.items || [];
    for (const it of list) items.set(it.id || mediaKey(it.url), it);
  }
  list = list.sort((a, b) => scoreItem(b) - scoreItem(a) || b.seenAt - a.seenAt);
  if (tabId == null || tabId < 0) return list;
  const filtered = list.filter((i) => i.tabId === tabId);
  return filtered.length ? filtered : list.slice(0, 30);
}

function scoreItem(it) {
  let s = Number(it.size) || 0;
  if (it.type === "hls") {
    // master playlist'i üste al (asıl video buradan seçilir)
    if (it.hlsKind === "master") s += 50_000_000;
    else s += 8_000_000;
  }
  if (it.type === "video") s += 1_000_000;
  if (/^video\//i.test(it.contentType || "")) s += 2_000_000;
  if (it.source === "network") s += 500_000;
  return s;
}

function updateBadge() {
  const n = items.size;
  chrome.action.setBadgeBackgroundColor({ color: "#e85d04" });
  chrome.action.setBadgeText({ text: n > 0 ? String(Math.min(n, 99)) : "" });
}

async function pingDownloader() {
  try {
    const res = await fetch(`${DOWNLOADER_URL}/health`, { method: "GET" });
    downloaderOnline = res.ok;
  } catch {
    downloaderOnline = false;
  }
  return downloaderOnline;
}

async function buildDownloadHeaders(item) {
  const headers = { ...(item.requestHeaders || {}) };
  let pageUrl = "";

  try {
    if (item.tabId >= 0) {
      const tab = await chrome.tabs.get(item.tabId);
      if (tab?.url && /^https?:/i.test(tab.url)) {
        pageUrl = tab.url;
        if (!headers.referer) headers.referer = tab.url;
        if (!headers.origin) headers.origin = new URL(tab.url).origin;
      }
    }
  } catch {
    /* ignore */
  }

  if (!headers.referer && item.initiator && /^https?:/i.test(item.initiator)) {
    headers.referer = item.initiator;
    pageUrl = pageUrl || item.initiator;
  }

  // 1) Ağdan yakalanan Cookie (CDN isteğine giden gerçek header)
  const captured = capturedCookies.get(item.id || mediaKey(item.url));
  if (captured) headers.cookie = captured;

  // 2) Tarayıcı cookie jar — hem medya hem sayfa domain'i
  try {
    if (chrome.cookies?.getAll) {
      const parts = new Map();
      const urls = [item.url, pageUrl, headers.referer].filter(Boolean);
      for (const u of urls) {
        try {
          const list = await chrome.cookies.getAll({ url: u });
          for (const c of list || []) parts.set(c.name, c.value);
        } catch {
          /* ignore */
        }
      }
      if (parts.size) {
        const jar = [...parts.entries()].map(([n, v]) => `${n}=${v}`).join("; ");
        // yakalanan cookie varsa birleştir (jar üzerine yazma, ekle)
        headers.cookie = headers.cookie ? mergeCookies(headers.cookie, jar) : jar;
      }
    }
  } catch {
    /* ignore */
  }

  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!v) continue;
    const key = k.toLowerCase();
    if (key === "range") continue;
    out[key] = v;
  }

  if (!out["user-agent"]) {
    out["user-agent"] =
      typeof navigator !== "undefined" && navigator.userAgent
        ? navigator.userAgent
        : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
  }
  if (!out.accept) out.accept = "*/*";

  return out;
}

function mergeCookies(a, b) {
  const map = new Map();
  for (const src of [a, b]) {
    for (const part of String(src).split(";")) {
      const idx = part.indexOf("=");
      if (idx < 1) continue;
      const name = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      if (name) map.set(name, val);
    }
  }
  return [...map.entries()].map(([n, v]) => `${n}=${v}`).join("; ");
}

async function probeItem(url, headers = {}) {
  if (!url) return { ok: false, error: "URL yok" };
  const online = await pingDownloader();
  if (!online) {
    return { ok: false, error: "Yerel servis kapalı", qualities: [] };
  }
  try {
    const res = await fetch(`${DOWNLOADER_URL}/probe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, headers }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || "probe başarısız", qualities: [] };
    return { ok: true, ...data };
  } catch (e) {
    return { ok: false, error: e?.message || String(e), qualities: [] };
  }
}

async function downloadItem(item, mode, quality = "auto") {
  if (!item?.url) return { ok: false, error: "URL yok" };

  // İsim .mp4 olsa bile /hls/ yolu → HLS olarak indir
  const forcedType = classifyMedia(item.url, item.contentType || "");
  const effective = { ...item, type: forcedType || item.type };

  if (forcedType === "hls" && item.type !== "hls") {
    // listede yanlış "video" kalan eski kayıtları düzelt
    effective.hlsKind = detectHlsKind(item.url, item.size || 0);
  }

  const headers = await buildDownloadHeaders(effective);
  const needsCompanion =
    effective.type === "hls" || effective.type === "dash" || mode === "companion";
  const online = await pingDownloader();

  // HLS/DASH → yerel servis (başlıklarla)
  if (needsCompanion) {
    if (!online) {
      return { ok: false, error: "HLS için yerel servis gerekli: npm start" };
    }
    // DOM'daki sahte .mp4 çoğu zaman playlist değil — master.txt tercih et
    if (/\/hls\//i.test(effective.url) && /\.mp4(?:$|\?|#)/i.test(effective.url) && !/\.m3u8|master\.txt/i.test(effective.url)) {
      const master = [...items.values()].find(
        (i) =>
          i.tabId === effective.tabId &&
          i.type === "hls" &&
          (/master\.(txt|m3u8)/i.test(i.url) || i.hlsKind === "master")
      );
      if (master) {
        const masterHeaders = await buildDownloadHeaders(master);
        const result = await companionDownload(master, masterHeaders, quality);
        if (result.ok) {
          return {
            ...result,
            note: "Sahte .mp4 yerine master playlist indiriliyor",
          };
        }
      }
      // master yoksa URL'yi HLS gibi dene (bazen media playlist)
      effective.type = "hls";
    }
    return companionDownload(effective, headers, quality);
  }

  // mp4: Referer+Cookie ile yerel servis (CDN hotlink koruması için)
  // doğrulama başarısızsa tarayıcı indirmesine düş
  if (online && mode !== "browser") {
    const companion = await companionDownload(item, headers, quality);
    if (companion.ok) return companion;

    const browserResult = await browserDownload(item);
    if (browserResult.ok) {
      return {
        ...browserResult,
        note: companion.error,
      };
    }
    return {
      ok: false,
      error:
        companion.error ||
        browserResult.error ||
        "404/403. Videoyu sayfada yeniden oynatıp hemen İndir'e bas.",
    };
  }

  const browserOnly = await browserDownload(item);
  if (browserOnly.ok) return browserOnly;
  return {
    ok: false,
    error:
      browserOnly.error ||
      "Servis kapalı. npm run app çalıştır; videoyu yeniden oynat.",
  };
}

function collectAudioUrls(item) {
  const urls = [];
  for (const it of items.values()) {
    if (item.tabId >= 0 && it.tabId !== item.tabId) continue;
    const u = it.url || "";
    if (/sublist_aud|\/aud\d|\baudio\b|TYPE=AUDIO/i.test(u) || /aud/i.test(it.filename || "")) {
      if (/\/hls\//i.test(u) || /\.(m3u8|txt)(?:$|\?)/i.test(u)) urls.push(u);
    }
  }
  return [...new Set(urls)];
}

async function companionDownload(item, headers, quality) {
  try {
    const filename = displayLabel(item);
    const audioUrls = item.type === "hls" || /\/hls\//i.test(item.url) ? collectAudioUrls(item) : [];
    const res = await fetch(`${DOWNLOADER_URL}/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: item.url,
        filename,
        type: item.type === "video" && /\/hls\//i.test(item.url) ? "hls" : item.type,
        quality: quality || "auto",
        estimatedBytes: Number(item.estimatedBytes) || 0,
        audioUrls,
        headers,
        verify: true,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      const tracked = (await chrome.storage.local.get("trackedJobs")).trackedJobs || [];
      const next = [
        { id: data.id, url: item.url, filename: item.filename, startedAt: Date.now() },
        ...tracked.filter((t) => t.id !== data.id),
      ].slice(0, 30);
      await chrome.storage.local.set({ trackedJobs: next });
      listJobs().catch(() => {});
      return { ok: true, via: "companion", jobId: data.id, path: data.path };
    }
    return { ok: false, error: data.error || `Servis hatası (${res.status})` };
  } catch {
    return {
      ok: false,
      error: "Yerel indirme servisi kapalı. `npm run app` çalıştır.",
    };
  }
}

async function browserDownload(item) {
  try {
    const downloadId = await chrome.downloads.download({
      url: item.url,
      filename: sanitizeFilename(item.filename),
      saveAs: false,
      conflictAction: "uniquify",
    });
    return { ok: true, via: "browser", downloadId };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

function sanitizeFilename(name) {
  return String(name || "video.mp4")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .slice(0, 180);
}

chrome.storage.local.get("items").then((data) => {
  for (const it of data.items || []) {
    items.set(it.id || mediaKey(it.url), it);
  }
  updateBadge();
});

globalThis.__vidsniff = { items, formatBytes, pingDownloader, pickHeader };
