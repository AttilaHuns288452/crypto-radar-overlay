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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function calculateBubbleBounds(workArea: WorkArea, size: number, margin: number): WindowBounds {
  return {
    x: Math.round(workArea.x + workArea.width - size - margin),
    y: Math.round(workArea.y + workArea.height - size - margin),
    width: size,
    height: size
  };
}

export function calculateStackedBubbleBounds(workArea: WorkArea, size: number, margin: number, gap: number): WindowBounds {
  const lowerBubble = calculateBubbleBounds(workArea, size, margin);

  return {
    x: lowerBubble.x,
    y: Math.round(lowerBubble.y - size - gap),
    width: size,
    height: size
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
