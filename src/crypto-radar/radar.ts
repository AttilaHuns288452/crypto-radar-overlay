export type BinanceTickerInput = {
  symbol: string;
  lastPrice: string;
  quoteVolume: string;
  priceChangePercent: string;
};

export type RadarSnapshot = {
  symbol: string;
  baseAsset: string;
  price: number;
  quoteVolume: number;
  change24hPct: number;
  timestamp: number;
};

export type RadarSettings = {
  maxRows: number;
  minQuoteVolume: number;
  movePctThreshold: number;
  velocityPctPerMinuteThreshold: number;
  volumeBurstThreshold: number;
  alertCooldownMs: number;
  ignoredSymbols: ReadonlySet<string>;
};

export type RadarCandidate = RadarSnapshot & {
  hasPreviousScan: boolean;
  movePct: number;
  velocityPctPerMinute: number;
  volumeBurst: number;
  rankScore: number;
  alertLevel: "quiet" | "watch" | "alert";
  direction: "up" | "down" | "flat";
  reason: string;
};

export type RadarAlert = {
  symbol: string;
  baseAsset: string;
  direction: "up" | "down" | "flat";
  message: string;
  timestamp: number;
  movePct: number;
  volumeBurst: number;
  price: number;
};

const STABLE_BASE_ASSETS = new Set([
  "USDT",
  "USDC",
  "BUSD",
  "FDUSD",
  "TUSD",
  "DAI",
  "USDP",
  "USDE",
  "USD1",
  "EUR",
  "TRY",
  "BRL",
  "GBP"
]);

const LEVERAGED_SUFFIXES = ["UP", "DOWN", "BULL", "BEAR"];

function asFiniteNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function directionFromMove(movePct: number, change24hPct: number): RadarCandidate["direction"] {
  const reference = Math.abs(movePct) > 0.001 ? movePct : change24hPct;
  if (reference > 0) {
    return "up";
  }
  if (reference < 0) {
    return "down";
  }
  return "flat";
}

function hasLeveragedSuffix(baseAsset: string) {
  return LEVERAGED_SUFFIXES.some((suffix) => {
    if (!baseAsset.endsWith(suffix)) {
      return false;
    }

    const underlying = baseAsset.slice(0, -suffix.length);
    return underlying.length >= 3;
  });
}

export function normalizeBinanceTickers(tickers: BinanceTickerInput[], timestamp = Date.now()): RadarSnapshot[] {
  return tickers
    .filter((ticker) => ticker.symbol.endsWith("USDT"))
    .map((ticker) => {
      const baseAsset = ticker.symbol.slice(0, -"USDT".length);
      const price = asFiniteNumber(ticker.lastPrice);
      const quoteVolume = asFiniteNumber(ticker.quoteVolume);
      const change24hPct = asFiniteNumber(ticker.priceChangePercent);

      if (
        !baseAsset ||
        STABLE_BASE_ASSETS.has(baseAsset) ||
        hasLeveragedSuffix(baseAsset) ||
        price === null ||
        quoteVolume === null ||
        change24hPct === null ||
        price <= 0 ||
        quoteVolume <= 0
      ) {
        return null;
      }

      return {
        symbol: ticker.symbol,
        baseAsset,
        price,
        quoteVolume,
        change24hPct,
        timestamp
      } satisfies RadarSnapshot;
    })
    .filter((snapshot): snapshot is RadarSnapshot => snapshot !== null);
}

export function rankRadarCandidates(
  current: RadarSnapshot[],
  previousBySymbol: ReadonlyMap<string, RadarSnapshot>,
  settings: RadarSettings
): RadarCandidate[] {
  return current
    .filter((snapshot) => snapshot.quoteVolume >= settings.minQuoteVolume)
    .filter((snapshot) => !settings.ignoredSymbols.has(snapshot.symbol))
    .map((snapshot) => {
      const previous = previousBySymbol.get(snapshot.symbol);
      const hasPreviousScan = previous !== undefined;
      const intervalMinutes = previous ? Math.max((snapshot.timestamp - previous.timestamp) / 60_000, 1 / 60) : 1;
      const movePct = previous ? ((snapshot.price - previous.price) / previous.price) * 100 : 0;
      const velocityPctPerMinute = movePct / intervalMinutes;
      const volumeDelta = previous ? Math.max(0, snapshot.quoteVolume - previous.quoteVolume) : 0;
      const expectedVolumeForInterval = Math.max((snapshot.quoteVolume / 1440) * intervalMinutes, 1);
      const volumeBurst = previous ? volumeDelta / expectedVolumeForInterval : 0;
      const absMove = Math.abs(movePct);
      const absVelocity = Math.abs(velocityPctPerMinute);
      const passesMove =
        previous !== undefined &&
        (absMove >= settings.movePctThreshold || absVelocity >= settings.velocityPctPerMinuteThreshold);
      const passesVolume = previous !== undefined && volumeBurst >= settings.volumeBurstThreshold;
      const alertLevel: RadarCandidate["alertLevel"] =
        passesMove && passesVolume ? "alert" : passesMove || passesVolume ? "watch" : "quiet";
      const rankScore =
        (alertLevel === "alert" ? 200 : alertLevel === "watch" ? 70 : 0) +
        absMove * 42 +
        absVelocity * 18 +
        Math.min(volumeBurst, 35) * 8 +
        Math.log10(snapshot.quoteVolume + 1) * 5 +
        Math.abs(snapshot.change24hPct) * 0.8;
      const direction = directionFromMove(movePct, snapshot.change24hPct);
      const reason =
        !hasPreviousScan
          ? `Baseline: ${snapshot.change24hPct > 0 ? "+" : ""}${round(snapshot.change24hPct)}% over 24h`
          : alertLevel === "alert"
          ? `${round(absMove)}% move with ${round(volumeBurst, 1)}x volume burst`
          : alertLevel === "watch"
            ? `${passesMove ? `${round(absMove)}% fast move` : `${round(volumeBurst, 1)}x volume burst`}`
            : `${round(snapshot.change24hPct)}% over 24h`;

      return {
        ...snapshot,
        hasPreviousScan,
        movePct: round(movePct, 3),
        velocityPctPerMinute: round(velocityPctPerMinute, 3),
        volumeBurst: round(volumeBurst, 2),
        rankScore: round(rankScore, 2),
        alertLevel,
        direction,
        reason
      };
    })
    .sort((left, right) => right.rankScore - left.rankScore)
    .slice(0, settings.maxRows);
}

export function buildAlertEvents(
  candidates: RadarCandidate[],
  lastAlertAtBySymbol: ReadonlyMap<string, number>,
  settings: RadarSettings
): RadarAlert[] {
  return candidates
    .filter((candidate) => candidate.alertLevel === "alert")
    .filter((candidate) => {
      const lastAlertAt = lastAlertAtBySymbol.get(candidate.symbol) ?? 0;
      return candidate.timestamp - lastAlertAt >= settings.alertCooldownMs;
    })
    .map((candidate) => {
      const action =
        candidate.direction === "up" ? "pumping fast" : candidate.direction === "down" ? "dropping fast" : "moving fast";
      return {
        symbol: candidate.symbol,
        baseAsset: candidate.baseAsset,
        direction: candidate.direction,
        message: `${candidate.symbol} ${action}: ${candidate.movePct.toFixed(2)}% with ${candidate.volumeBurst.toFixed(
          1
        )}x volume burst`,
        timestamp: candidate.timestamp,
        movePct: candidate.movePct,
        volumeBurst: candidate.volumeBurst,
        price: candidate.price
      };
    });
}
