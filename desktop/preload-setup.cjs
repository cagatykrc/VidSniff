const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vidsniffSetup", {
  getPaths: () => ipcRenderer.invoke("setup:paths"),
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
});
