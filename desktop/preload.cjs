const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vidsniff", {
  listJobs: () => ipcRenderer.invoke("jobs:list"),
  clearJobs: () => ipcRenderer.invoke("jobs:clear"),
  openDownloads: () => ipcRenderer.invoke("downloads:open"),
  showInFolder: (filePath) => ipcRenderer.invoke("shell:show", filePath),
  openSetup: () => ipcRenderer.invoke("ui:openSetup"),
  openSettings: () => ipcRenderer.invoke("ui:openSettings"),
  openBrowser: () => ipcRenderer.invoke("ui:openBrowser"),
  getI18n: () => ipcRenderer.invoke("i18n:get"),
  onLangChanged: (cb) => {
    const handler = (_e, lang) => cb(lang);
    ipcRenderer.on("lang:changed", handler);
    return () => ipcRenderer.removeListener("lang:changed", handler);
  },
  api: "http://127.0.0.1:17890",
});
