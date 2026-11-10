const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vidsniff", {
  listJobs: () => ipcRenderer.invoke("jobs:list"),
  openDownloads: () => ipcRenderer.invoke("downloads:open"),
  showInFolder: (filePath) => ipcRenderer.invoke("shell:show", filePath),
  openSetup: () => ipcRenderer.invoke("ui:openSetup"),
  openSettings: () => ipcRenderer.invoke("ui:openSettings"),
  api: "http://127.0.0.1:17890",
});
