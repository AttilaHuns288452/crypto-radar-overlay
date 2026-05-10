import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { createAppPaths } from "./app-paths.js";

describe("crypto radar app paths", () => {
  it("resolves project files from the compiled main module directory instead of the process cwd", () => {
    const projectRoot = path.resolve("C:/Projects/crypto-radar-overlay");
    const paths = createAppPaths(path.join(projectRoot, "dist", "crypto-radar"));

    assert.equal(paths.projectRoot, projectRoot);
    assert.equal(paths.mainScript, path.join(projectRoot, "dist", "crypto-radar", "main.js"));
    assert.equal(paths.rendererHtml, path.join(projectRoot, "src", "crypto-radar", "renderer", "index.html"));
    assert.equal(paths.bubbleHtml, path.join(projectRoot, "src", "crypto-radar", "renderer", "bubble.html"));
  });
});
