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

export type RadarCandidateCalculation = {
  scanIntervalMinutes: number;
  previousPrice: number | null;
  priceDelta: number;
  previousQuoteVolume: number | null;
  volumeDelta: number;
  expectedVolumeForInterval: number;
  checks: {
    moveThreshold: boolean;
    speedThreshold: boolean;
    volumeThreshold: boolean;
  };
  scoreParts: {
    level: number;
    move: number;
    speed: number;
    volumeBurst: number;
    liquidity: number;
    change24h: number;
  };
  moveFormula: string;
  velocityFormula: string;
  volumeBurstFormula: string;
  scoreFormula: string;
  alertCheckSummary: string;
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
  calculation: RadarCandidateCalculation;
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

function formatFormulaNumber(value: number) {
  return String(round(value, 8));
}

function formatSignedPct(value: number) {
  return `${value > 0 ? "+" : ""}${round(value, 2).toFixed(2)}%`;
}

function formatUsdCompact(value: number) {
  const sign = value < 0 ? "-" : "";
  const absValue = Math.abs(value);
  if (absValue >= 1_000_000_000) {
    return `${sign}$${(absValue / 1_000_000_000).toFixed(1)}B`;
  }
  if (absValue >= 1_000_000) {
    return `${sign}$${(absValue / 1_000_000).toFixed(1)}M`;
  }
  if (absValue >= 1_000) {
    return `${sign}$${(absValue / 1_000).toFixed(1)}K`;
  }
  return `${sign}$${absValue.toFixed(2)}`;
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

function buildCalculation(
  snapshot: RadarSnapshot,
  previous: RadarSnapshot | undefined,
  intervalMinutes: number,
  movePct: number,
  velocityPctPerMinute: number,
  volumeDelta: number,
  expectedVolumeForInterval: number,
  volumeBurst: number,
  settings: RadarSettings,
  alertLevel: RadarCandidate["alertLevel"],
  scoreParts: RadarCandidateCalculation["scoreParts"],
  rankScore: number,
  passesMoveThreshold: boolean,
  passesVelocityThreshold: boolean,
  passesVolume: boolean
): RadarCandidateCalculation {
  const levelLabel = alertLevel === "alert" ? "alert" : alertLevel === "watch" ? "watch" : "quiet";
  const moveFormula = previous
    ? `((${formatFormulaNumber(snapshot.price)} - ${formatFormulaNumber(previous.price)}) / ${formatFormulaNumber(
        previous.price
      )}) x 100 = ${formatSignedPct(movePct)}`
    : "Waiting for scan 2: no previous price yet";
  const velocityFormula = previous
    ? `${formatSignedPct(movePct)} / ${intervalMinutes.toFixed(2)} min = ${formatSignedPct(velocityPctPerMinute)}/min`
    : "Waiting for scan 2: no previous speed yet";
  const volumeBurstFormula = previous
    ? `${formatUsdCompact(volumeDelta)} new volume / ${formatUsdCompact(
        expectedVolumeForInterval
      )} normal pace = ${round(volumeBurst, 2).toFixed(2)}x`
    : "Waiting for scan 2: no previous volume yet";
  const scoreFormula = `${scoreParts.level.toFixed(2)} ${levelLabel} + ${scoreParts.move.toFixed(
    2
  )} move + ${scoreParts.speed.toFixed(2)} speed + ${scoreParts.volumeBurst.toFixed(
    2
  )} volume + ${scoreParts.liquidity.toFixed(2)} liquidity + ${scoreParts.change24h.toFixed(
    2
  )} 24h = ${rankScore.toFixed(2)}`;
  const alertCheckSummary = previous
    ? `Move ${round(Math.abs(movePct), 2).toFixed(2)}% / ${settings.movePctThreshold.toFixed(
        2
      )}%, speed ${round(Math.abs(velocityPctPerMinute), 2).toFixed(
        2
      )}%/min / ${settings.velocityPctPerMinuteThreshold.toFixed(2)}, volume ${round(volumeBurst, 2).toFixed(
        2
      )}x / ${settings.volumeBurstThreshold.toFixed(2)}x`
    : "First scan sets the baseline. Numbers start after the next scan.";

  return {
    scanIntervalMinutes: round(intervalMinutes, 2),
    previousPrice: previous?.price ?? null,
    priceDelta: round(previous ? snapshot.price - previous.price : 0, 8),
    previousQuoteVolume: previous?.quoteVolume ?? null,
    volumeDelta: round(volumeDelta, 2),
    expectedVolumeForInterval: round(expectedVolumeForInterval, 2),
    checks: {
      moveThreshold: passesMoveThreshold,
      speedThreshold: passesVelocityThreshold,
      volumeThreshold: passesVolume
    },
    scoreParts,
    moveFormula,
    velocityFormula,
    volumeBurstFormula,
    scoreFormula,
    alertCheckSummary
  };
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
      const passesMoveThreshold = previous !== undefined && absMove >= settings.movePctThreshold;
      const passesVelocityThreshold = previous !== undefined && absVelocity >= settings.velocityPctPerMinuteThreshold;
      const passesMove = passesMoveThreshold || passesVelocityThreshold;
      const passesVolume = previous !== undefined && volumeBurst >= settings.volumeBurstThreshold;
      const alertLevel: RadarCandidate["alertLevel"] =
        passesMove && passesVolume ? "alert" : passesMove || passesVolume ? "watch" : "quiet";
      const rawScoreParts = {
        level: alertLevel === "alert" ? 200 : alertLevel === "watch" ? 70 : 0,
        move: absMove * 42,
        speed: absVelocity * 18,
        volumeBurst: Math.min(volumeBurst, 35) * 8,
        liquidity: Math.log10(snapshot.quoteVolume + 1) * 5,
        change24h: Math.abs(snapshot.change24hPct) * 0.8
      };
      const scoreParts = {
        level: rawScoreParts.level,
        move: round(rawScoreParts.move),
        speed: round(rawScoreParts.speed),
        volumeBurst: round(rawScoreParts.volumeBurst),
        liquidity: round(rawScoreParts.liquidity),
        change24h: round(rawScoreParts.change24h)
      };
      const rankScore =
        rawScoreParts.level +
        rawScoreParts.move +
        rawScoreParts.speed +
        rawScoreParts.volumeBurst +
        rawScoreParts.liquidity +
        rawScoreParts.change24h;
      const direction = directionFromMove(movePct, snapshot.change24hPct);
      const reason =
        !hasPreviousScan
          ? `Baseline: ${snapshot.change24hPct > 0 ? "+" : ""}${round(snapshot.change24hPct)}% over 24h`
          : alertLevel === "alert"
          ? `${round(absMove)}% move with ${round(volumeBurst, 1)}x volume burst`
          : alertLevel === "watch"
            ? `${passesMove ? `${round(absMove)}% fast move` : `${round(volumeBurst, 1)}x volume burst`}`
            : `${round(snapshot.change24hPct)}% over 24h`;
      const roundedRankScore = round(rankScore, 2);
      const calculation = buildCalculation(
        snapshot,
        previous,
        intervalMinutes,
        movePct,
        velocityPctPerMinute,
        volumeDelta,
        expectedVolumeForInterval,
        volumeBurst,
        settings,
        alertLevel,
        scoreParts,
        roundedRankScore,
        passesMoveThreshold,
        passesVelocityThreshold,
        passesVolume
      );

      return {
        ...snapshot,
        hasPreviousScan,
        movePct: round(movePct, 3),
        velocityPctPerMinute: round(velocityPctPerMinute, 3),
        volumeBurst: round(volumeBurst, 2),
        rankScore: roundedRankScore,
        alertLevel,
        direction,
        reason,
        calculation
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
