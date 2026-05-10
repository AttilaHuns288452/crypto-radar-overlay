import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldUseSingleInstanceLock } from "./runtime-options.js";

describe("crypto radar runtime options", () => {
  it("uses a single-instance lock for normal app launches", () => {
    assert.equal(shouldUseSingleInstanceLock(["electron.exe", "dist/crypto-radar/main.js"]), true);
  });

  it("skips the single-instance lock for isolated smoke-test launches", () => {
    assert.equal(
      shouldUseSingleInstanceLock(["electron.exe", "dist/crypto-radar/main.js", "--crypto-radar-smoke"]),
      false
    );
  });
});
