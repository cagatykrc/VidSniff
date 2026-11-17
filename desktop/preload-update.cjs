const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vidsniffUpdate", {
  onProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("update:progress", handler);
    return () => ipcRenderer.removeListener("update:progress", handler);
  },
});
