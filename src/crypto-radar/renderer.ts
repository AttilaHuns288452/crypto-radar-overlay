import {
  buildAlertEvents,
  normalizeBinanceTickers,
  rankRadarCandidates,
  type BinanceTickerInput,
  type RadarAlert,
  type RadarCandidate,
  type RadarSettings,
  type RadarSnapshot
} from "./radar.js";

type IpcRendererLike = {
  send(channel: string, payload?: unknown): void;
};

type StoredSettings = {
  monitoring: boolean;
  muted: boolean;
  pinned: boolean;
  movePctThreshold: number;
  velocityPctPerMinuteThreshold: number;
  volumeBurstThreshold: number;
  minQuoteVolumeMillions: number;
  refreshSeconds: number;
  alertCooldownSeconds: number;
  ignoredSymbols: string[];
};

declare global {
  interface Window {
    require?: (module: "electron") => { ipcRenderer: IpcRendererLike };
  }
}

const FEED_URLS = [
  "https://data-api.binance.vision/api/v3/ticker/24hr",
  "https://api.binance.us/api/v3/ticker/24hr",
  "https://api.binance.com/api/v3/ticker/24hr",
  "https://api1.binance.com/api/v3/ticker/24hr"
];

const DEFAULT_SETTINGS: StoredSettings = {
  monitoring: true,
  muted: false,
  pinned: true,
  movePctThreshold: 0.7,
  velocityPctPerMinuteThreshold: 0.45,
  volumeBurstThreshold: 2.5,
  minQuoteVolumeMillions: 5,
  refreshSeconds: 15,
  alertCooldownSeconds: 180,
  ignoredSymbols: []
};

const ipcRenderer = window.require?.("electron").ipcRenderer;
const state = {
  previous: new Map<string, RadarSnapshot>(),
  lastAlertAt: new Map<string, number>(),
  alerts: [] as RadarAlert[],
  pollTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  activeFeedUrl: "",
  lastUpdatedAt: 0,
  settings: loadSettings()
};

function getEl<T extends HTMLElement>(id: string) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing #${id}`);
  }
  return element as T;
}

const refs = {
  monitorToggle: getEl<HTMLInputElement>("monitorToggle"),
  muteToggle: getEl<HTMLInputElement>("muteToggle"),
  pinToggle: getEl<HTMLInputElement>("pinToggle"),
  moveThreshold: getEl<HTMLInputElement>("moveThreshold"),
  burstThreshold: getEl<HTMLInputElement>("burstThreshold"),
  minVolume: getEl<HTMLInputElement>("minVolume"),
  refreshSeconds: getEl<HTMLInputElement>("refreshSeconds"),
  radarRows: getEl<HTMLDivElement>("radarRows"),
  alertFeed: getEl<HTMLDivElement>("alertFeed"),
  statusText: getEl<HTMLDivElement>("statusText"),
  statusDot: getEl<HTMLDivElement>("statusDot"),
  sourceText: getEl<HTMLSpanElement>("sourceText"),
  updatedText: getEl<HTMLSpanElement>("updatedText"),
  resetHiddenButton: getEl<HTMLButtonElement>("resetHiddenButton"),
  minimizeButton: getEl<HTMLButtonElement>("minimizeButton"),
  closeButton: getEl<HTMLButtonElement>("closeButton")
};

function loadSettings(): StoredSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem("crypto-radar-settings") || "{}") as Partial<StoredSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      ignoredSymbols: Array.isArray(parsed.ignoredSymbols) ? parsed.ignoredSymbols : []
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function persistSettings() {
  localStorage.setItem("crypto-radar-settings", JSON.stringify(state.settings));
}

function toRadarSettings(): RadarSettings {
  return {
    maxRows: 10,
    minQuoteVolume: state.settings.minQuoteVolumeMillions * 1_000_000,
    movePctThreshold: state.settings.movePctThreshold,
    velocityPctPerMinuteThreshold: state.settings.velocityPctPerMinuteThreshold,
    volumeBurstThreshold: state.settings.volumeBurstThreshold,
    alertCooldownMs: state.settings.alertCooldownSeconds * 1000,
    ignoredSymbols: new Set(state.settings.ignoredSymbols)
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPrice(value: number) {
  if (value >= 1000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  if (value >= 1) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
  }
  return value.toLocaleString(undefined, { maximumSignificantDigits: 4 });
}

function formatPct(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatVolume(value: number) {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  return `$${Math.round(value).toLocaleString()}`;
}

function setStatus(text: string, mode: "live" | "paused" | "error" = "live") {
  refs.statusText.textContent = text;
  refs.statusDot.className = `status-dot ${mode}`;
}

async function fetchTickerData() {
  const errors: string[] = [];
  for (const url of FEED_URLS) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          Accept: "application/json"
        }
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      state.activeFeedUrl = new URL(url).host;
      return (await response.json()) as BinanceTickerInput[];
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(errors.join(" | "));
}

function renderControls() {
  refs.monitorToggle.checked = state.settings.monitoring;
  refs.muteToggle.checked = state.settings.muted;
  refs.pinToggle.checked = state.settings.pinned;
  refs.moveThreshold.value = String(state.settings.movePctThreshold);
  refs.burstThreshold.value = String(state.settings.volumeBurstThreshold);
  refs.minVolume.value = String(state.settings.minQuoteVolumeMillions);
  refs.refreshSeconds.value = String(state.settings.refreshSeconds);
  refs.sourceText.textContent = state.activeFeedUrl || "warming";
  refs.updatedText.textContent = state.lastUpdatedAt ? new Date(state.lastUpdatedAt).toLocaleTimeString() : "--:--";
}

function rowClass(candidate: RadarCandidate) {
  return ["radar-row", candidate.alertLevel, candidate.direction].join(" ");
}

function alertLabel(candidate: RadarCandidate) {
  if (!candidate.hasPreviousScan) {
    return "Base";
  }
  if (candidate.alertLevel === "alert") {
    return "Alert";
  }
  if (candidate.alertLevel === "watch") {
    return "Watch";
  }
  return "Quiet";
}

function moveDisplay(candidate: RadarCandidate) {
  return candidate.hasPreviousScan ? formatPct(candidate.movePct) : "--";
}

function spikeDisplay(candidate: RadarCandidate) {
  return candidate.hasPreviousScan ? `${candidate.volumeBurst.toFixed(1)}x` : "--";
}

function renderRows(candidates: RadarCandidate[]) {
  refs.radarRows.innerHTML = candidates
    .map(
      (candidate, index) => `
        <article class="${rowClass(candidate)}" title="${escapeHtml(candidate.reason)}">
          <div class="rank" title="Radar rank based on fast movement, volume spike, and liquidity.">${index + 1}</div>
          <div class="coin-main">
            <div class="coin-title">
              <strong>${escapeHtml(candidate.baseAsset)}</strong>
              <span>${escapeHtml(candidate.symbol)}</span>
              <em class="level-badge ${candidate.alertLevel}">${alertLabel(candidate)}</em>
            </div>
            <div class="reason">${escapeHtml(candidate.reason)}</div>
          </div>
          <div class="row-metrics">
            <div class="metric price" title="Current last traded price."><span>Price</span><strong>$${formatPrice(candidate.price)}</strong></div>
            <div class="metric ${candidate.direction}" title="Price change since the previous scan. Starts after the second scan."><span>Move</span><strong>${moveDisplay(
              candidate
            )}</strong></div>
            <div class="metric burst" title="Volume pace compared with normal 24h pace. Starts after the second scan."><span>Spike</span><strong>${spikeDisplay(
              candidate
            )}</strong></div>
            <div class="metric volume" title="Total USDT volume traded in the last 24 hours."><span>24h Vol</span><strong>${formatVolume(
              candidate.quoteVolume
            )}</strong></div>
          </div>
          <button class="icon-button hide-button" data-hide="${escapeHtml(candidate.symbol)}" title="Hide this coin from the radar">x</button>
        </article>
      `
    )
    .join("");

  if (candidates.length === 0) {
    refs.radarRows.innerHTML = `<div class="empty-state">No liquid USDT pairs match the current filters.</div>`;
  }

  refs.radarRows.querySelectorAll<HTMLButtonElement>("[data-hide]").forEach((button) => {
    button.addEventListener("click", () => {
      const symbol = button.dataset.hide;
      if (!symbol || state.settings.ignoredSymbols.includes(symbol)) {
        return;
      }
      state.settings.ignoredSymbols.push(symbol);
      persistSettings();
      void pollNow();
    });
  });
}

function renderAlertFeed() {
  refs.alertFeed.innerHTML = state.alerts
    .slice(0, 8)
    .map(
      (alert) => `
        <div class="alert-item ${alert.direction}">
          <strong>${escapeHtml(alert.symbol)}</strong>
          <span>${escapeHtml(alert.message)}</span>
          <small>${new Date(alert.timestamp).toLocaleTimeString()}</small>
        </div>
      `
    )
    .join("");

  if (state.alerts.length === 0) {
    refs.alertFeed.innerHTML = `<div class="empty-state small">Waiting for a confirmed fast move.</div>`;
  }
}

function emitDesktopAlert(alert: RadarAlert) {
  if (state.settings.muted) {
    return;
  }

  if (ipcRenderer) {
    ipcRenderer.send("crypto-radar:alert", alert);
    return;
  }

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(`Crypto move: ${alert.symbol}`, { body: alert.message });
  }
}

function processAlerts(candidates: RadarCandidate[]) {
  const alerts = buildAlertEvents(candidates, state.lastAlertAt, toRadarSettings());
  for (const alert of alerts) {
    state.lastAlertAt.set(alert.symbol, alert.timestamp);
    state.alerts.unshift(alert);
    emitDesktopAlert(alert);
  }
  state.alerts = state.alerts.slice(0, 30);
  renderAlertFeed();
}

function scheduleNextPoll() {
  if (state.pollTimer) {
    clearTimeout(state.pollTimer);
  }
  if (!state.settings.monitoring) {
    setStatus("Paused", "paused");
    return;
  }
  state.pollTimer = setTimeout(() => {
    void pollNow();
  }, Math.max(5, state.settings.refreshSeconds) * 1000);
}

async function pollNow() {
  renderControls();
  if (!state.settings.monitoring) {
    scheduleNextPoll();
    return;
  }

  setStatus("Scanning", "live");
  try {
    const timestamp = Date.now();
    const tickers = await fetchTickerData();
    const snapshots = normalizeBinanceTickers(tickers, timestamp);
    const candidates = rankRadarCandidates(snapshots, state.previous, toRadarSettings());
    state.previous = new Map(snapshots.map((snapshot) => [snapshot.symbol, snapshot]));
    state.lastUpdatedAt = timestamp;
    renderRows(candidates);
    processAlerts(candidates);
    setStatus("Live", "live");
  } catch (error) {
    setStatus("Feed error", "error");
    refs.radarRows.innerHTML = `<div class="empty-state error">${escapeHtml(
      error instanceof Error ? error.message : String(error)
    )}</div>`;
  } finally {
    renderControls();
    scheduleNextPoll();
  }
}

function bindControls() {
  refs.monitorToggle.addEventListener("change", () => {
    state.settings.monitoring = refs.monitorToggle.checked;
    persistSettings();
    void pollNow();
  });
  refs.muteToggle.addEventListener("change", () => {
    state.settings.muted = refs.muteToggle.checked;
    persistSettings();
  });
  refs.pinToggle.addEventListener("change", () => {
    state.settings.pinned = refs.pinToggle.checked;
    persistSettings();
    ipcRenderer?.send("crypto-radar:pin", state.settings.pinned);
  });

  for (const input of [refs.moveThreshold, refs.burstThreshold, refs.minVolume, refs.refreshSeconds]) {
    input.addEventListener("change", () => {
      state.settings.movePctThreshold = Math.max(0.1, Number(refs.moveThreshold.value) || DEFAULT_SETTINGS.movePctThreshold);
      state.settings.volumeBurstThreshold = Math.max(1, Number(refs.burstThreshold.value) || DEFAULT_SETTINGS.volumeBurstThreshold);
      state.settings.minQuoteVolumeMillions = Math.max(0.1, Number(refs.minVolume.value) || DEFAULT_SETTINGS.minQuoteVolumeMillions);
      state.settings.refreshSeconds = Math.max(5, Number(refs.refreshSeconds.value) || DEFAULT_SETTINGS.refreshSeconds);
      persistSettings();
      void pollNow();
    });
  }

  refs.resetHiddenButton.addEventListener("click", () => {
    state.settings.ignoredSymbols = [];
    persistSettings();
    void pollNow();
  });
  refs.minimizeButton.addEventListener("click", () => ipcRenderer?.send("crypto-radar:minimize"));
  refs.closeButton.addEventListener("click", () => ipcRenderer?.send("crypto-radar:close"));
}

function boot() {
  bindControls();
  renderControls();
  renderAlertFeed();
  setStatus("Starting", "live");
  ipcRenderer?.send("crypto-radar:pin", state.settings.pinned);
  void pollNow();
}

boot();
