import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateAnchoredPanelBounds,
  calculateBubbleBounds,
  calculateDraggedBubbleBounds,
  calculateStackedBubbleBounds,
  calculateVirtualWorkArea,
  clampWindowBounds,
  normalizeBubbleBounds
} from "./window-state.js";

describe("crypto radar window state helpers", () => {
  it("places the bubble in the lower right of the work area", () => {
    const bounds = calculateBubbleBounds(
      {
        x: 0,
        y: 0,
        width: 1920,
        height: 1040
      },
      62,
      18
    );

    assert.deepEqual(bounds, {
      x: 1840,
      y: 960,
      width: 62,
      height: 62
    });
  });

  it("respects non-zero work area origins", () => {
    const bounds = calculateBubbleBounds(
      {
        x: -1280,
        y: 40,
        width: 1280,
        height: 984
      },
      58,
      16
    );

    assert.deepEqual(bounds, {
      x: -74,
      y: 950,
      width: 58,
      height: 58
    });
  });

  it("places a stacked bubble directly above the lower-right bubble", () => {
    const bounds = calculateStackedBubbleBounds(
      {
        x: 0,
        y: 0,
        width: 1920,
        height: 1040
      },
      62,
      18,
      12
    );

    assert.deepEqual(bounds, {
      x: 1840,
      y: 886,
      width: 62,
      height: 62
    });
  });

  it("anchors a popup above the stacked bubble while keeping it on screen", () => {
    const bounds = calculateAnchoredPanelBounds(
      {
        x: 0,
        y: 0,
        width: 1920,
        height: 1040
      },
      {
        x: 1840,
        y: 886,
        width: 62,
        height: 62
      },
      460,
      760,
      16
    );

    assert.deepEqual(bounds, {
      x: 1442,
      y: 110,
      width: 460,
      height: 760
    });
  });

  it("can reserve right and down drag room from the default bubble position", () => {
    const bounds = calculateBubbleBounds(
      {
        x: 0,
        y: 0,
        width: 1600,
        height: 900
      },
      32,
      12,
      96
    );

    assert.deepEqual(bounds, {
      x: 1460,
      y: 760,
      width: 32,
      height: 32
    });
  });

  it("keeps dragged bubbles inside the visible work area", () => {
    const bounds = clampWindowBounds(
      {
        x: 0,
        y: 0,
        width: 1920,
        height: 1040
      },
      {
        x: 1905,
        y: -24,
        width: 48,
        height: 48
      }
    );

    assert.deepEqual(bounds, {
      x: 1872,
      y: 0,
      width: 48,
      height: 48
    });
  });

  it("normalizes inflated native bubble rectangles before applying drag deltas", () => {
    const bounds = calculateDraggedBubbleBounds(
      {
        x: 0,
        y: 0,
        width: 1536,
        height: 816
      },
      {
        x: 1412,
        y: 534,
        width: 124,
        height: 178
      },
      {
        deltaX: 200,
        deltaY: 300
      },
      32
    );

    assert.deepEqual(bounds, {
      x: 1504,
      y: 784,
      width: 32,
      height: 32
    });
  });

  it("normalizes saved startup bubble bounds to the real icon size", () => {
    const bounds = normalizeBubbleBounds(
      {
        x: 0,
        y: 0,
        width: 1536,
        height: 816
      },
      {
        x: 1498,
        y: 728,
        width: 96,
        height: 122
      },
      32
    );

    assert.deepEqual(bounds, {
      x: 1498,
      y: 728,
      width: 32,
      height: 32
    });
  });

  it("combines multiple displays so bubbles can move across the full desktop", () => {
    const bounds = calculateVirtualWorkArea([
      {
        x: 0,
        y: 0,
        width: 1920,
        height: 1040
      },
      {
        x: 1920,
        y: 80,
        width: 1280,
        height: 960
      }
    ]);

    assert.deepEqual(bounds, {
      x: 0,
      y: 0,
      width: 3200,
      height: 1040
    });
  });
});
