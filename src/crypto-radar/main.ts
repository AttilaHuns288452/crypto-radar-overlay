import { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, screen, shell, Tray } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAppPaths } from "./app-paths.js";
import { calculateBubbleBounds } from "./window-state.js";
import { shouldUseSingleInstanceLock } from "./runtime-options.js";

let mainWindow: BrowserWindow | null = null;
let bubbleWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let pinned = true;

const appPaths = createAppPaths(path.dirname(fileURLToPath(import.meta.url)));
const cryptoRadarUserDataPath = path.join(app.getPath("appData"), "CryptoRadarOverlay");
app.setPath("userData", cryptoRadarUserDataPath);
const hasSingleInstanceLock = shouldUseSingleInstanceLock(process.argv) ? app.requestSingleInstanceLock() : true;

if (!hasSingleInstanceLock) {
  app.quit();
}

function getRendererPath() {
  return appPaths.rendererHtml;
}

function getBubblePath() {
  return appPaths.bubbleHtml;
}

function createTrayIcon() {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">',
    '<rect width="64" height="64" rx="15" fill="#090b0f"/>',
    '<path d="M14 42 25 31l8 7 17-21" fill="none" stroke="#32d583" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>',
    '<circle cx="50" cy="17" r="5" fill="#68a7ff"/>',
    "</svg>"
  ].join("");

  return nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`).resize({
    width: 16,
    height: 16
  });
}

function enableAutoStart() {
  if (process.platform !== "win32") {
    return;
  }

  app.setLoginItemSettings({
    openAtLogin: true,
    path: process.execPath,
    args: app.isPackaged ? [] : [appPaths.mainScript]
  });
}

function updateTrayMenu() {
  if (!tray) {
    return;
  }

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Open Crypto Radar",
        click: () => showMainWindow()
      },
      {
        label: "Hide to Bubble",
        click: () => hideToBubble()
      },
      {
        label: "Always on top",
        type: "checkbox",
        checked: pinned,
        click: (item) => setPinned(item.checked)
      },
      { type: "separator" },
      {
        label: "Quit Crypto Radar",
        click: () => quitApp()
      }
    ])
  );
}

function createTray() {
  if (tray) {
    return;
  }

  tray = new Tray(createTrayIcon());
  tray.setToolTip("Crypto Radar");
  tray.on("click", () => showMainWindow());
  updateTrayMenu();
}

function setPinned(enabled: boolean) {
  pinned = enabled;
  mainWindow?.setAlwaysOnTop(pinned, "floating");
  bubbleWindow?.setAlwaysOnTop(true, "floating");
  updateTrayMenu();
}

function createBubbleWindow() {
  if (bubbleWindow) {
    return bubbleWindow;
  }

  bubbleWindow = new BrowserWindow({
    width: 62,
    height: 62,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: "Crypto Radar Bubble",
    backgroundColor: "#00000000",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  bubbleWindow.setAlwaysOnTop(true, "floating");
  bubbleWindow.loadFile(getBubblePath());
  bubbleWindow.on("closed", () => {
    bubbleWindow = null;
  });

  return bubbleWindow;
}

function hideToBubble() {
  if (!mainWindow) {
    return;
  }

  mainWindow.hide();
  const bubble = createBubbleWindow();
  const display = screen.getDisplayMatching(mainWindow.getBounds());
  bubble.setBounds(calculateBubbleBounds(display.workArea, 62, 18));
  bubble.showInactive();
}

function showMainWindow() {
  bubbleWindow?.hide();

  if (!mainWindow) {
    createWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function quitApp() {
  isQuitting = true;
  bubbleWindow?.destroy();
  mainWindow?.destroy();
  app.quit();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 760,
    minWidth: 360,
    minHeight: 520,
    frame: false,
    resizable: true,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    title: "Crypto Radar",
    backgroundColor: "#090b0f",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.setAlwaysOnTop(pinned, "floating");
  mainWindow.loadFile(getRendererPath());
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("close", (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    quitApp();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.setAppUserModelId("CryptoRadar.Overlay");

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) {
    return;
  }

  enableAutoStart();
  createTray();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("second-instance", () => {
  showMainWindow();
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.on("crypto-radar:minimize", () => {
  hideToBubble();
});

ipcMain.on("crypto-radar:close", () => {
  quitApp();
});

ipcMain.on("crypto-radar:pin", (_event, enabled: boolean) => {
  setPinned(enabled);
});

ipcMain.on("crypto-radar:restore", () => {
  showMainWindow();
});

ipcMain.on("crypto-radar:alert", (_event, alert: { symbol: string; message: string }) => {
  if (!Notification.isSupported()) {
    return;
  }

  new Notification({
    title: `Crypto move: ${alert.symbol}`,
    body: alert.message,
    silent: false
  }).show();
});
