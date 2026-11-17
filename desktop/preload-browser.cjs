const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vidsniffBrowser", {
  navigate: (url) => ipcRenderer.invoke("browser:navigate", url),
  back: () => ipcRenderer.invoke("browser:back"),
  forward: () => ipcRenderer.invoke("browser:forward"),
  reload: () => ipcRenderer.invoke("browser:reload"),
  stop: () => ipcRenderer.invoke("browser:stop"),
  getPrimary: () => ipcRenderer.invoke("browser:getPrimary"),
  probe: (payload) => ipcRenderer.invoke("browser:probe", payload),
  download: (payload) => ipcRenderer.invoke("browser:download", payload),
  job: (id) => ipcRenderer.invoke("browser:job", id),
  clearCaptures: () => ipcRenderer.invoke("browser:clearCaptures"),
  openFolder: () => ipcRenderer.invoke("browser:openFolder"),
  openSettings: () => ipcRenderer.invoke("browser:openSettings"),
  showInFolder: (p) => ipcRenderer.invoke("browser:showInFolder", p),
  setJobsOpen: (open) => ipcRenderer.invoke("browser:setJobsOpen", open),
  onEvent: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("browser:event", handler);
    return () => ipcRenderer.removeListener("browser:event", handler);
  },
});
