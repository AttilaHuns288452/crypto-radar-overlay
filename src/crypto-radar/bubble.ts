type BubbleIpcRenderer = {
  send(channel: string): void;
};

const electronRequire = (
  window as Window & {
    require?: (module: "electron") => { ipcRenderer: BubbleIpcRenderer };
  }
).require;

const ipcRenderer = electronRequire?.("electron").ipcRenderer;
const restoreButton = document.getElementById("restoreButton");

restoreButton?.addEventListener("click", () => {
  ipcRenderer?.send("crypto-radar:restore");
});
