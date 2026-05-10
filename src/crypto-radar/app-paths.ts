import path from "node:path";

export type CryptoRadarAppPaths = {
  projectRoot: string;
  mainScript: string;
  rendererHtml: string;
  bubbleHtml: string;
};

export function createAppPaths(compiledMainDir: string): CryptoRadarAppPaths {
  const projectRoot = path.resolve(compiledMainDir, "..", "..");

  return {
    projectRoot,
    mainScript: path.join(projectRoot, "dist", "crypto-radar", "main.js"),
    rendererHtml: path.join(projectRoot, "src", "crypto-radar", "renderer", "index.html"),
    bubbleHtml: path.join(projectRoot, "src", "crypto-radar", "renderer", "bubble.html")
  };
}
