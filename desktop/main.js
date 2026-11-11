import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  shell,
  ipcMain,
  dialog,
} from "electron";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  startDownloader,
  stopDownloader,
  getDownloadDir,
  getJobs,
  setPrefs,
} from "../downloader/server.js";
import { STRINGS, normalizeLang, t } from "./i18n.js";
import { checkLatestRelease, downloadAndInstall } from "./updater.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ICON = path.join(ROOT, "extension", "icons", "icon128.png");
const DATA_DIR = path.join(app.getPath("userData"), "runtime");
const STABLE_DIR = path.join(
  process.env.LOCALAPPDATA || app.getPath("userData"),
  "VidSniff"
);
const PREFS_PATH = path.join(STABLE_DIR, "prefs.json");

let tray = null;
let panel = null;
let setupWin = null;
let settingsWin = null;
let quitting = false;
let extPaths = { chromeExt: "", firefoxExt: "" };
/** @type {{ lang: string }} */
let prefs = { lang: "tr" };
let updateBusy = false;

async function loadPrefs() {
  try {
    const raw = JSON.parse(await fsp.readFile(PREFS_PATH, "utf8"));
    if (raw?.lang) prefs.lang = normalizeLang(raw.lang);
  } catch {
    prefs.lang = normalizeLang(app.getLocale());
  }
}

async function savePrefs() {
  await fsp.mkdir(STABLE_DIR, { recursive: true });
  await fsp.writeFile(PREFS_PATH, JSON.stringify(prefs, null, 2), "utf8");
  setPrefs(prefs);
  broadcastLang();
}

function broadcastLang() {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("lang:changed", prefs.lang);
  }
  rebuildTrayMenu();
  refreshTrayTitle();
}

async function ensureStableExtensions() {
  await fsp.mkdir(STABLE_DIR, { recursive: true });
  const variants = [
    { name: "extension-chrome", manifest: "manifest.chrome.json" },
    { name: "extension-firefox", manifest: "manifest.json" },
  ];
  const shared = [
    "background.js",
    "content.js",
    "content.css",
    "i18n-global.js",
    "popup.html",
    "popup.js",
    "popup.css",
    "lib/media.js",
    "lib/i18n.js",
    "icons/icon16.png",
    "icons/icon32.png",
    "icons/icon48.png",
    "icons/icon128.png",
  ];

  for (const v of variants) {
    const dest = path.join(STABLE_DIR, v.name);
    await fsp.rm(dest, { recursive: true, force: true });
    await fsp.mkdir(path.join(dest, "lib"), { recursive: true });
    await fsp.mkdir(path.join(dest, "icons"), { recursive: true });
    await fsp.copyFile(
      path.join(ROOT, "extension", v.manifest),
      path.join(dest, "manifest.json")
    );
    for (const rel of shared) {
      await fsp.copyFile(path.join(ROOT, "extension", rel), path.join(dest, rel));
    }
  }
  return {
    chromeExt: path.join(STABLE_DIR, "extension-chrome"),
    firefoxExt: path.join(STABLE_DIR, "extension-firefox"),
  };
}

function setAutostart(enabled) {
  app.setLoginItemSettings({
    openAtLogin: !!enabled,
    path: process.execPath,
    args: app.isPackaged ? [] : [ROOT],
  });
}

async function main() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await loadPrefs();
  extPaths = await ensureStableExtensions();

  const downloadDir = path.join(STABLE_DIR, "downloads");
  try {
    await startDownloader({ downloadDir, prefs });
  } catch (e) {
    if (e?.code !== "EADDRINUSE") throw e;
    console.log("Servis zaten açık (17890)");
    setPrefs(prefs);
  }

  const image = nativeImage.createFromPath(ICON);
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  rebuildTrayMenu();
  tray.on("double-click", () => showPanel());

  ipcMain.handle("jobs:list", () => getJobs());
  ipcMain.handle("downloads:open", () => shell.openPath(getDownloadDir()));
  ipcMain.handle("shell:show", (_e, filePath) => {
    if (filePath) shell.showItemInFolder(filePath);
  });

  ipcMain.handle("setup:paths", () => ({
    ...extPaths,
    openAtLogin: app.getLoginItemSettings().openAtLogin,
    downloadDir: getDownloadDir(),
    version: app.getVersion(),
    lang: prefs.lang,
  }));
  ipcMain.handle("i18n:get", () => ({
    lang: prefs.lang,
    strings: STRINGS[prefs.lang] || STRINGS.en,
  }));
  ipcMain.handle("i18n:set", async (_e, lang) => {
    prefs.lang = normalizeLang(lang);
    await savePrefs();
    return prefs.lang;
  });
  ipcMain.handle("setup:openChromeExt", () => shell.openPath(extPaths.chromeExt));
  ipcMain.handle("setup:openFirefoxExt", () => shell.openPath(extPaths.firefoxExt));
  ipcMain.handle("setup:openBrowserExtensions", (_e, browser) =>
    openBrowserExtensionsPage(browser)
  );
  ipcMain.handle("setup:runGuide", async (_e, browser) => {
    await shell.openPath(extPaths.chromeExt);
    try {
      const { clipboard } = await import("electron");
      clipboard.writeText(extPaths.chromeExt);
    } catch {
      /* ignore */
    }
    return openBrowserExtensionsPage(browser || "chrome");
  });
  ipcMain.handle("setup:openDownloads", () => shell.openPath(getDownloadDir()));
  ipcMain.handle("setup:autostart", (_e, enabled) => {
    setAutostart(enabled);
    return true;
  });
  ipcMain.handle("setup:close", () => {
    if (setupWin && !setupWin.isDestroyed()) setupWin.close();
  });
  ipcMain.handle("settings:close", () => {
    if (settingsWin && !settingsWin.isDestroyed()) settingsWin.close();
  });
  ipcMain.handle("ui:openSetup", () => {
    showSetup();
    return true;
  });
  ipcMain.handle("ui:openSettings", () => {
    showSettings();
    return true;
  });
  ipcMain.handle("update:check", async (_e, opts = {}) => {
    return runUpdateCheck({ silent: !!opts.silent, manual: true });
  });

  const flag = path.join(DATA_DIR, "setup-done");
  if (!fs.existsSync(flag)) {
    showSetup();
    await fsp.writeFile(flag, new Date().toISOString(), "utf8");
  } else {
    showPanel();
  }

  refreshTrayTitle();
  setInterval(refreshTrayTitle, 2000);

  // Her açılışta GitHub Releases kontrolü (UI otursun diye kısa gecikme)
  setTimeout(() => {
    runUpdateCheck({ silent: true, manual: false }).catch((e) =>
      console.warn("[update]", e?.message || e)
    );
  }, 2500);
}

/**
 * @param {{ silent?: boolean, manual?: boolean }} opts
 * silent: güncelleme yoksa / ağ hatasında sus (açılış için)
 * manual: Ayarlar/tepsi — sonuç her zaman göster
 */
async function runUpdateCheck({ silent = false, manual = false } = {}) {
  if (updateBusy) return { ok: false, busy: true };
  updateBusy = true;
  const L = prefs.lang;
  const current = app.getVersion();
  try {
    let release;
    try {
      release = await checkLatestRelease(current);
    } catch (e) {
      if (e?.message === "NO_SETUP_ASSET" || e?.version) {
        if (manual || !silent) {
          await dialog.showMessageBox({
            type: "warning",
            title: t(L, "updateErrorTitle"),
            message: t(L, "updateNoAsset", { latest: e.version || "?" }),
            buttons: [t(L, "updateOk")],
          });
        }
        return { ok: false, error: "NO_SETUP_ASSET", version: e.version };
      }
      if (manual) {
        await dialog.showMessageBox({
          type: "error",
          title: t(L, "updateErrorTitle"),
          message: t(L, "updateErrorBody", { error: e?.message || String(e) }),
          buttons: [t(L, "updateOk")],
        });
      }
      return { ok: false, error: e?.message || String(e) };
    }

    if (!release) {
      if (manual) {
        await dialog.showMessageBox({
          type: "info",
          title: t(L, "updateNoneTitle"),
          message: t(L, "updateNoneBody", { current }),
          buttons: [t(L, "updateOk")],
        });
      }
      return { ok: true, upToDate: true, current };
    }

    const choice = await dialog.showMessageBox({
      type: "info",
      title: t(L, "updateAvailableTitle"),
      message: t(L, "updateAvailableBody", {
        latest: release.version,
        current,
      }),
      detail: release.notes || undefined,
      buttons: [t(L, "updateYes"), t(L, "updateLater")],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (choice.response !== 0) {
      return { ok: true, skipped: true, version: release.version };
    }

    const progress = { pct: 0 };
    // Basit ilerleme: her %10’da bir log; dialog donmasın diye ayrı await
    await downloadAndInstall(release, (pct) => {
      progress.pct = pct;
      if (pct % 20 === 0) {
        console.log(`[update] ${pct}%`);
      }
    });

    quitting = true;
    try {
      await stopDownloader();
    } catch {
      /* ignore */
    }
    app.quit();
    return { ok: true, installing: true, version: release.version };
  } finally {
    updateBusy = false;
  }
}

function findBrowserExe(browser) {
  const local = process.env.LOCALAPPDATA || "";
  const pf = process.env.PROGRAMFILES || "C:\\Program Files";
  const pf86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
  const map = {
    chrome: [
      path.join(local, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(pf, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(pf86, "Google", "Chrome", "Application", "chrome.exe"),
    ],
    edge: [
      path.join(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
    ],
    brave: [
      path.join(local, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
      path.join(pf, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
    ],
  };
  for (const p of map[browser] || []) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function openBrowserExtensionsPage(browser) {
  const exe = findBrowserExe(browser);
  if (!exe) {
    return {
      ok: false,
      error: t(prefs.lang, "setupBrowserMissing", { browser }),
    };
  }
  const url = browser === "edge" ? "edge://extensions" : "chrome://extensions";
  spawn(exe, [url], { detached: true, stdio: "ignore" }).unref();
  return { ok: true, exe, url };
}

function rebuildTrayMenu() {
  if (!tray) return;
  const L = prefs.lang;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t(L, "trayPanel"), click: () => showPanel() },
      { label: t(L, "traySetup"), click: () => showSetup() },
      { label: t(L, "traySettings"), click: () => showSettings() },
      {
        label: t(L, "trayDownloads"),
        click: () => shell.openPath(getDownloadDir()),
      },
      {
        label: t(L, "trayCheckUpdate"),
        click: () => {
          runUpdateCheck({ silent: false, manual: true }).catch(() => {});
        },
      },
      { type: "separator" },
      {
        label: t(L, "trayQuit"),
        click: async () => {
          quitting = true;
          try {
            await stopDownloader();
          } catch {
            /* ignore */
          }
          app.quit();
        },
      },
    ])
  );
}

function refreshTrayTitle() {
  if (!tray) return;
  const running = getJobs().filter((j) => j.status === "running").length;
  tray.setToolTip(
    running
      ? t(prefs.lang, "trayTooltipRunning", { n: running })
      : t(prefs.lang, "trayTooltip")
  );
}

function showPanel() {
  if (panel && !panel.isDestroyed()) {
    panel.show();
    panel.focus();
    return;
  }
  panel = new BrowserWindow({
    width: 460,
    height: 560,
    minWidth: 380,
    minHeight: 420,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#12141a",
    icon: ICON,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  panel.loadFile(path.join(__dirname, "panel.html"));
  panel.once("ready-to-show", () => panel.show());
  panel.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      panel.hide();
    }
  });
}

function showSetup() {
  if (setupWin && !setupWin.isDestroyed()) {
    setupWin.show();
    setupWin.focus();
    return;
  }
  setupWin = new BrowserWindow({
    width: 520,
    height: 620,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#12141a",
    icon: ICON,
    title: t(prefs.lang, "setupTitle"),
    webPreferences: {
      preload: path.join(__dirname, "preload-setup.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  setupWin.loadFile(path.join(__dirname, "setup.html"));
  setupWin.once("ready-to-show", () => setupWin.show());
}

function showSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 440,
    height: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#12141a",
    icon: ICON,
    title: t(prefs.lang, "settingsTitle"),
    webPreferences: {
      preload: path.join(__dirname, "preload-setup.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWin.loadFile(path.join(__dirname, "settings.html"));
  settingsWin.once("ready-to-show", () => settingsWin.show());
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => showPanel());
  app.whenReady().then(main).catch(async (e) => {
    console.error(e);
    try {
      await dialog.showErrorBox(
        t(prefs.lang || "en", "errOpenTitle"),
        e?.stack || e?.message || String(e)
      );
    } catch {
      /* ignore */
    }
    app.quit();
  });
  app.on("window-all-closed", (e) => e.preventDefault());
  app.on("before-quit", () => {
    quitting = true;
  });
}
