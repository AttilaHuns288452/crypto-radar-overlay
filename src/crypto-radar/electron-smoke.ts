import { _electron as electron } from "playwright";
import path from "node:path";

type ElectronWindowState = {
  title: string;
  visible: boolean;
  alwaysOnTop: boolean;
};

async function getWindows(app: Awaited<ReturnType<typeof electron.launch>>): Promise<ElectronWindowState[]> {
  return app.evaluate(async ({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((window) => ({
      title: window.getTitle(),
      visible: window.isVisible(),
      alwaysOnTop: window.isAlwaysOnTop()
    }))
  );
}

async function testMinimizeToBubble() {
  const app = await electron.launch({ args: [path.resolve("dist/crypto-radar/main.js"), "--crypto-radar-smoke"] });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("#minimizeButton", { timeout: 15_000 });
    await page.waitForSelector(".guide-grid", { timeout: 15_000 });
    await page.waitForSelector(".radar-head", { timeout: 15_000 });

    const guideText = await page.locator(".guide-grid").innerText();
    if (
      !guideText.includes("Move") ||
      !guideText.includes("Vol Spike") ||
      !guideText.includes("24h Vol") ||
      guideText.includes("Score")
    ) {
      throw new Error(`Expected number guide to stay simple without score/calculation UI. Guide text: ${guideText}`);
    }

    const bodyText = await page.locator("body").innerText();
    if (bodyText.includes("Why / calculation") || bodyText.includes("Rank score")) {
      throw new Error(`Expected overlay to hide detailed calculations. Body text: ${bodyText}`);
    }

    await page.locator("#minimizeButton").click();
    await page.waitForTimeout(1_200);

    const windows = await getWindows(app);
    const main = windows.find((window) => window.title === "Crypto Radar");
    const bubble = windows.find((window) => window.title === "Crypto Radar Bubble");

    if (!main || main.visible) {
      throw new Error(`Expected main window hidden after minimize. Windows: ${JSON.stringify(windows)}`);
    }
    if (!bubble || !bubble.visible || !bubble.alwaysOnTop) {
      throw new Error(`Expected visible always-on-top bubble after minimize. Windows: ${JSON.stringify(windows)}`);
    }

    const bubblePage = app.windows().find((window) => window.url().includes("bubble.html"));
    if (!bubblePage) {
      throw new Error("Expected bubble renderer page after minimize.");
    }

    const restoreButtonDragRegion = await bubblePage
      .locator("#restoreButton")
      .evaluate((element) => getComputedStyle(element).getPropertyValue("-webkit-app-region"));
    if (restoreButtonDragRegion !== "no-drag") {
      throw new Error(`Expected bubble restore button to be clickable, got app-region=${restoreButtonDragRegion}`);
    }
  } finally {
    await app.evaluate(async ({ app }) => app.exit(0)).catch(() => undefined);
  }
}

async function testCloseQuits() {
  const app = await electron.launch({ args: [path.resolve("dist/crypto-radar/main.js"), "--crypto-radar-smoke"] });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("#closeButton", { timeout: 15_000 });
    await page.locator("#closeButton").click();
    await app.waitForEvent("close", { timeout: 8_000 });
  } finally {
    await app.evaluate(async ({ app }) => app.exit(0)).catch(() => undefined);
  }
}

await testMinimizeToBubble();
await testCloseQuits();

console.log("Electron smoke passed: minimize hides to bubble and close quits.");
