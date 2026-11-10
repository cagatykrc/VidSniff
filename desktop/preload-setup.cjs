const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vidsniffSetup", {
  getPaths: () => ipcRenderer.invoke("setup:paths"),
  getI18n: () => ipcRenderer.invoke("i18n:get"),
  setLang: (lang) => ipcRenderer.invoke("i18n:set", lang),
  openChromeExt: () => ipcRenderer.invoke("setup:openChromeExt"),
  openFirefoxExt: () => ipcRenderer.invoke("setup:openFirefoxExt"),
  openBrowserExtensions: (browser) =>
    ipcRenderer.invoke("setup:openBrowserExtensions", browser),
  runGuide: (browser) => ipcRenderer.invoke("setup:runGuide", browser),
  openDownloads: () => ipcRenderer.invoke("setup:openDownloads"),
  setAutostart: (enabled) => ipcRenderer.invoke("setup:autostart", enabled),
  close: () => ipcRenderer.invoke("setup:close"),
  closeSettings: () => ipcRenderer.invoke("settings:close"),
  openGuide: () => ipcRenderer.invoke("ui:openSetup"),
  onLangChanged: (cb) => {
    const handler = (_e, lang) => cb(lang);
    ipcRenderer.on("lang:changed", handler);
    return () => ipcRenderer.removeListener("lang:changed", handler);
  },
});
