export type WorkArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DragDelta = {
  deltaX: number;
  deltaY: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function calculateBubbleBounds(workArea: WorkArea, size: number, margin: number, dragRoom = 0): WindowBounds {
  const edgeInset = margin + dragRoom;

  return {
    x: Math.round(workArea.x + workArea.width - size - edgeInset),
    y: Math.round(workArea.y + workArea.height - size - edgeInset),
    width: size,
    height: size
  };
}

export function calculateStackedBubbleBounds(
  workArea: WorkArea,
  size: number,
  margin: number,
  gap: number,
  dragRoom = 0
): WindowBounds {
  const lowerBubble = calculateBubbleBounds(workArea, size, margin, dragRoom);

  return {
    x: lowerBubble.x,
    y: Math.round(lowerBubble.y - size - gap),
    width: size,
    height: size
  };
}

export function clampWindowBounds(workArea: WorkArea, bounds: WindowBounds): WindowBounds {
  const maxX = Math.max(workArea.x, workArea.x + workArea.width - bounds.width);
  const maxY = Math.max(workArea.y, workArea.y + workArea.height - bounds.height);

  return {
    x: Math.round(clamp(bounds.x, workArea.x, maxX)),
    y: Math.round(clamp(bounds.y, workArea.y, maxY)),
    width: bounds.width,
    height: bounds.height
  };
}

export function normalizeBubbleBounds(workArea: WorkArea, bounds: WindowBounds, size: number): WindowBounds {
  return clampWindowBounds(workArea, {
    x: bounds.x,
    y: bounds.y,
    width: size,
    height: size
  });
}

export function calculateDraggedBubbleBounds(
  workArea: WorkArea,
  currentBounds: WindowBounds,
  delta: DragDelta,
  size: number
): WindowBounds {
  return normalizeBubbleBounds(
    workArea,
    {
      x: currentBounds.x + Math.round(delta.deltaX),
      y: currentBounds.y + Math.round(delta.deltaY),
      width: currentBounds.width,
      height: currentBounds.height
    },
    size
  );
}

export function calculateVirtualWorkArea(workAreas: WorkArea[]): WorkArea {
  if (workAreas.length === 0) {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0
    };
  }

  const left = Math.min(...workAreas.map((area) => area.x));
  const top = Math.min(...workAreas.map((area) => area.y));
  const right = Math.max(...workAreas.map((area) => area.x + area.width));
  const bottom = Math.max(...workAreas.map((area) => area.y + area.height));

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

export function calculateAnchoredPanelBounds(
  workArea: WorkArea,
  anchorBounds: WindowBounds,
  panelWidth: number,
  panelHeight: number,
  gap: number
): WindowBounds {
  const maxX = workArea.x + workArea.width - panelWidth;
  const maxY = workArea.y + workArea.height - panelHeight;

  return {
    x: Math.round(clamp(anchorBounds.x + anchorBounds.width - panelWidth, workArea.x, maxX)),
    y: Math.round(clamp(anchorBounds.y - gap - panelHeight, workArea.y, maxY)),
    width: panelWidth,
    height: panelHeight
  };
}
