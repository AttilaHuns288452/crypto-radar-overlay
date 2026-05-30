type BubbleIpcRenderer = {
  send(channel: string, payload?: unknown): void;
};

const electronRequire = (
  window as Window & {
    require?: (module: "electron") => { ipcRenderer: BubbleIpcRenderer };
  }
).require;

const ipcRenderer = electronRequire?.("electron").ipcRenderer;
const restoreButton = document.getElementById("restoreButton");
const closeBubbleButton = document.getElementById("closeBubbleButton");
const dragSurface = document.body;
const DRAG_THRESHOLD_PX = 2;

let pointerState:
  | {
      pointerId: number;
      startX: number;
      startY: number;
      lastX: number;
      lastY: number;
      dragging: boolean;
    }
  | undefined;
let suppressNextClick = false;

function finishPointer(event: PointerEvent) {
  if (!pointerState || pointerState.pointerId !== event.pointerId) {
    return;
  }

  const wasDragging = pointerState.dragging;
  if (pointerState.dragging) {
    suppressNextClick = true;
    window.setTimeout(() => {
      suppressNextClick = false;
    }, 0);
  }

  if (dragSurface.hasPointerCapture(event.pointerId)) {
    dragSurface.releasePointerCapture(event.pointerId);
  }
  document.body.classList.remove("is-dragging");
  pointerState = undefined;

  if (wasDragging) {
    ipcRenderer?.send("crypto-radar:bubble-drag-end");
  } else {
    event.preventDefault();
    event.stopPropagation();
    ipcRenderer?.send("crypto-radar:restore");
  }
}

dragSurface.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || closeBubbleButton?.contains(event.target as Node)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  pointerState = {
    pointerId: event.pointerId,
    startX: event.screenX,
    startY: event.screenY,
    lastX: event.screenX,
    lastY: event.screenY,
    dragging: false
  };
  dragSurface.setPointerCapture(event.pointerId);
});

dragSurface.addEventListener("pointermove", (event) => {
  if (!pointerState || pointerState.pointerId !== event.pointerId) {
    return;
  }

  const totalX = event.screenX - pointerState.startX;
  const totalY = event.screenY - pointerState.startY;
  const deltaX = event.screenX - pointerState.lastX;
  const deltaY = event.screenY - pointerState.lastY;

  if (!pointerState.dragging && Math.hypot(totalX, totalY) >= DRAG_THRESHOLD_PX) {
    pointerState.dragging = true;
    document.body.classList.add("is-dragging");
  }

  if (pointerState.dragging && (deltaX !== 0 || deltaY !== 0)) {
    ipcRenderer?.send("crypto-radar:bubble-drag", { deltaX, deltaY });
    event.preventDefault();
    event.stopPropagation();
  }

  pointerState.lastX = event.screenX;
  pointerState.lastY = event.screenY;
});

dragSurface.addEventListener("pointerup", finishPointer);
dragSurface.addEventListener("pointercancel", finishPointer);

restoreButton?.addEventListener("click", (event) => {
  if (suppressNextClick) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  event.preventDefault();
  event.stopPropagation();
});

closeBubbleButton?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  ipcRenderer?.send("crypto-radar:close");
});

closeBubbleButton?.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});
