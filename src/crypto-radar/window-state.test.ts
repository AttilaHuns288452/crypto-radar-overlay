import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateAnchoredPanelBounds, calculateBubbleBounds, calculateStackedBubbleBounds } from "./window-state.js";

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
});
