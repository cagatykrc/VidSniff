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
} from "../downloader/server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ICON = path.join(ROOT, "extension", "icons", "icon128.png");
const DATA_DIR = path.join(app.getPath("userData"), "runtime");
const STABLE_DIR = path.join(
  process.env.LOCALAPPDATA || app.getPath("userData"),
  "VidSniff"
);

let tray = null;
let panel = null;
let setupWin = null;
let settingsWin = null;
let quitting = false;
let extPaths = { chromeExt: "", firefoxExt: "" };

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
    "popup.html",
    "popup.js",
    "popup.css",
    "lib/media.js",
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
  extPaths = await ensureStableExtensions();

  const downloadDir = path.join(STABLE_DIR, "downloads");
  try {
    await startDownloader({ downloadDir });
  } catch (e) {
    if (e?.code !== "EADDRINUSE") throw e;
    console.log("Servis zaten açık (17890)");
  }

  const image = nativeImage.createFromPath(ICON);
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip("VidSniff");
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
  }));
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

  const flag = path.join(DATA_DIR, "setup-done");
  if (!fs.existsSync(flag)) {
    showSetup();
    await fsp.writeFile(flag, new Date().toISOString(), "utf8");
  } else {
    showPanel();
  }

  refreshTrayTitle();
  setInterval(refreshTrayTitle, 2000);
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
  if (!exe) return { ok: false, error: `${browser} yüklü görünmüyor` };
  const url = browser === "edge" ? "edge://extensions" : "chrome://extensions";
  spawn(exe, [url], { detached: true, stdio: "ignore" }).unref();
  return { ok: true, exe, url };
}

function rebuildTrayMenu() {
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "İndirme paneli", click: () => showPanel() },
      { label: "Eklenti kurulum asistanı", click: () => showSetup() },
      { label: "Ayarlar", click: () => showSettings() },
      {
        label: "İndirmeler klasörü",
        click: () => shell.openPath(getDownloadDir()),
      },
      { type: "separator" },
      {
        label: "Çıkış",
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
  tray.setToolTip(running ? `VidSniff — ${running} indirme` : "VidSniff");
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
    title: "Eklenti Kurulum Asistanı",
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
    height: 520,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#12141a",
    icon: ICON,
    title: "VidSniff — Ayarlar",
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
        "VidSniff açılamadı",
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
