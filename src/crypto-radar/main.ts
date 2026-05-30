import { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, screen, shell, Tray } from "electron";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAppPaths } from "./app-paths.js";
import {
  calculateBubbleBounds,
  calculateDraggedBubbleBounds,
  calculateVirtualWorkArea,
  clampWindowBounds,
  normalizeBubbleBounds,
  type WindowBounds
} from "./window-state.js";
import { shouldUseSingleInstanceLock } from "./runtime-options.js";

let mainWindow: BrowserWindow | null = null;
let bubbleWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let pinned = true;
let cryptoBubbleBounds: WindowBounds | null = null;
let persistBubbleBoundsTimer: NodeJS.Timeout | undefined;

const CRYPTO_BUBBLE_SIZE = 32;
const SCREEN_EDGE_MARGIN = 12;
const BUBBLE_DRAG_ROOM = 220;
const isSmoke = process.argv.includes("--crypto-radar-smoke");

type BubbleDragDelta = {
  deltaX: number;
  deltaY: number;
};

const appPaths = createAppPaths(path.dirname(fileURLToPath(import.meta.url)));
const cryptoRadarUserDataPath = path.join(app.getPath("appData"), "CryptoRadarOverlay");
app.setPath("userData", cryptoRadarUserDataPath);
const cryptoBubbleStatePath = path.join(cryptoRadarUserDataPath, "bubble-state.json");
const hasSingleInstanceLock = shouldUseSingleInstanceLock(process.argv) ? app.requestSingleInstanceLock() : true;
const shouldStartInBubble = process.argv.includes("--start-bubble") || (!isSmoke && app.getLoginItemSettings().wasOpenedAtLogin);

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
    args: app.isPackaged ? ["--start-bubble"] : [appPaths.mainScript, "--start-bubble"]
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
  if (mainWindow) {
    setWindowAlwaysOnTop(mainWindow, pinned);
  }
  if (bubbleWindow) {
    keepBubbleAboveWindows(bubbleWindow);
  }
  updateTrayMenu();
}

function setWindowAlwaysOnTop(window: BrowserWindow, enabled: boolean) {
  window.setAlwaysOnTop(enabled, process.platform === "win32" ? "normal" : "floating");
}

function keepBubbleAboveWindows(bubble: BrowserWindow) {
  setWindowAlwaysOnTop(bubble, true);
  bubble.moveTop();
}

function createBubbleWindow() {
  if (bubbleWindow) {
    return bubbleWindow;
  }

  bubbleWindow = new BrowserWindow({
    width: CRYPTO_BUBBLE_SIZE,
    height: CRYPTO_BUBBLE_SIZE,
    useContentSize: true,
    minWidth: CRYPTO_BUBBLE_SIZE,
    minHeight: CRYPTO_BUBBLE_SIZE,
    maxWidth: CRYPTO_BUBBLE_SIZE,
    maxHeight: CRYPTO_BUBBLE_SIZE,
    frame: false,
    transparent: true,
    hasShadow: false,
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

  keepBubbleAboveWindows(bubbleWindow);
  bubbleWindow.setMinimumSize(CRYPTO_BUBBLE_SIZE, CRYPTO_BUBBLE_SIZE);
  bubbleWindow.setMaximumSize(CRYPTO_BUBBLE_SIZE, CRYPTO_BUBBLE_SIZE);
  bubbleWindow.loadFile(getBubblePath());
  bubbleWindow.on("closed", () => {
    bubbleWindow = null;
  });

  return bubbleWindow;
}

function getDefaultCryptoBubbleBounds() {
  const display = mainWindow ? screen.getDisplayMatching(mainWindow.getBounds()) : screen.getPrimaryDisplay();
  return calculateBubbleBounds(display.workArea, CRYPTO_BUBBLE_SIZE, SCREEN_EDGE_MARGIN, BUBBLE_DRAG_ROOM);
}

function getVirtualWorkArea() {
  return calculateVirtualWorkArea(screen.getAllDisplays().map((display) => display.workArea));
}

function clampCryptoBubbleBounds(bounds: WindowBounds) {
  return clampWindowBounds(getVirtualWorkArea(), bounds);
}

function readStoredCryptoBubbleBounds() {
  if (isSmoke) {
    return null;
  }

  try {
    const stored = JSON.parse(readFileSync(cryptoBubbleStatePath, "utf8").replace(/^\uFEFF/, "")) as Partial<WindowBounds>;
    if (!Number.isFinite(stored.x) || !Number.isFinite(stored.y)) {
      return null;
    }

    return normalizeBubbleBounds(
      getVirtualWorkArea(),
      {
        x: Number(stored.x),
        y: Number(stored.y),
        width: CRYPTO_BUBBLE_SIZE,
        height: CRYPTO_BUBBLE_SIZE
      },
      CRYPTO_BUBBLE_SIZE
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("Crypto Radar bubble state read skipped:", error);
    }
    return null;
  }
}

function persistCryptoBubbleBounds(bounds = cryptoBubbleBounds) {
  if (isSmoke || !bounds) {
    return;
  }

  try {
    mkdirSync(path.dirname(cryptoBubbleStatePath), { recursive: true });
    writeFileSync(cryptoBubbleStatePath, JSON.stringify({ x: bounds.x, y: bounds.y }, null, 2), "utf8");
  } catch (error) {
    console.warn("Crypto Radar bubble state save skipped:", error);
  }
}

function schedulePersistCryptoBubbleBounds() {
  if (persistBubbleBoundsTimer) {
    clearTimeout(persistBubbleBoundsTimer);
  }
  persistBubbleBoundsTimer = setTimeout(() => {
    persistBubbleBoundsTimer = undefined;
    persistCryptoBubbleBounds();
  }, 150);
}

function getCryptoBubbleBounds() {
  return cryptoBubbleBounds
    ? clampCryptoBubbleBounds(cryptoBubbleBounds)
    : readStoredCryptoBubbleBounds() ?? getDefaultCryptoBubbleBounds();
}

function showBubbleWindow() {
  mainWindow?.hide();
  const bubble = createBubbleWindow();
  cryptoBubbleBounds = getCryptoBubbleBounds();
  bubble.setBounds(cryptoBubbleBounds);
  bubble.show();
  keepBubbleAboveWindows(bubble);
}

function hideToBubble() {
  showBubbleWindow();
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

function moveCryptoBubble(delta: BubbleDragDelta) {
  if (!bubbleWindow || !Number.isFinite(delta.deltaX) || !Number.isFinite(delta.deltaY)) {
    return;
  }

  const currentBounds = bubbleWindow.getBounds();
  cryptoBubbleBounds = calculateDraggedBubbleBounds(getVirtualWorkArea(), currentBounds, delta, CRYPTO_BUBBLE_SIZE);
  bubbleWindow.setBounds(cryptoBubbleBounds);
  schedulePersistCryptoBubbleBounds();
}

function quitApp() {
  isQuitting = true;
  if (persistBubbleBoundsTimer) {
    clearTimeout(persistBubbleBoundsTimer);
    persistBubbleBoundsTimer = undefined;
  }
  persistCryptoBubbleBounds();
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

  setWindowAlwaysOnTop(mainWindow, pinned);
  mainWindow.loadFile(getRendererPath());
  mainWindow.once("ready-to-show", () => {
    if (shouldStartInBubble) {
      showBubbleWindow();
      return;
    }
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

  if (!isSmoke) {
    enableAutoStart();
  }
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

ipcMain.on("crypto-radar:bubble-drag", (_event, delta: BubbleDragDelta) => {
  moveCryptoBubble(delta);
});

ipcMain.on("crypto-radar:bubble-drag-end", () => {
  persistCryptoBubbleBounds();
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
