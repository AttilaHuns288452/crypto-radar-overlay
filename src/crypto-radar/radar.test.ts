import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAlertEvents,
  normalizeBinanceTickers,
  rankRadarCandidates,
  type RadarSnapshot,
  type RadarSettings
} from "./radar.js";

const baseSettings: RadarSettings = {
  maxRows: 10,
  minQuoteVolume: 1_000_000,
  movePctThreshold: 0.7,
  velocityPctPerMinuteThreshold: 0.45,
  volumeBurstThreshold: 2.5,
  alertCooldownMs: 180_000,
  ignoredSymbols: new Set()
};

describe("crypto radar market logic", () => {
  it("normalizes Binance tickers into liquid spot USDT snapshots", () => {
    const snapshots = normalizeBinanceTickers(
      [
        { symbol: "BTCUSDT", lastPrice: "68000", quoteVolume: "500000000", priceChangePercent: "2.1" },
        { symbol: "ETHUSDT", lastPrice: "3300", quoteVolume: "250000000", priceChangePercent: "-1.2" },
        { symbol: "JUPUSDT", lastPrice: "0.42", quoteVolume: "30000000", priceChangePercent: "4.4" },
        { symbol: "USDCUSDT", lastPrice: "1", quoteVolume: "600000000", priceChangePercent: "0.01" },
        { symbol: "ETHBUSD", lastPrice: "3300", quoteVolume: "10000000", priceChangePercent: "0.2" },
        { symbol: "BTCUPUSDT", lastPrice: "12", quoteVolume: "2000000", priceChangePercent: "9" },
        { symbol: "BROKENUSDT", lastPrice: "0", quoteVolume: "2000000", priceChangePercent: "9" }
      ],
      1_700_000_000_000
    );

    assert.deepEqual(
      snapshots.map((snapshot) => snapshot.symbol),
      ["BTCUSDT", "ETHUSDT", "JUPUSDT"]
    );
    assert.equal(snapshots[0].baseAsset, "BTC");
    assert.equal(snapshots[0].price, 68000);
  });

  it("ranks sudden high-volume movers ahead of slower large-cap names", () => {
    const previous = new Map<string, RadarSnapshot>([
      [
        "FASTUSDT",
        {
          symbol: "FASTUSDT",
          baseAsset: "FAST",
          price: 100,
          quoteVolume: 10_000_000,
          change24hPct: 1,
          timestamp: 1_700_000_000_000
        }
      ],
      [
        "SLOWUSDT",
        {
          symbol: "SLOWUSDT",
          baseAsset: "SLOW",
          price: 50,
          quoteVolume: 400_000_000,
          change24hPct: 0.2,
          timestamp: 1_700_000_000_000
        }
      ]
    ]);
    const current: RadarSnapshot[] = [
      {
        symbol: "SLOWUSDT",
        baseAsset: "SLOW",
        price: 50.05,
        quoteVolume: 401_000_000,
        change24hPct: 0.3,
        timestamp: 1_700_000_060_000
      },
      {
        symbol: "FASTUSDT",
        baseAsset: "FAST",
        price: 101.2,
        quoteVolume: 10_300_000,
        change24hPct: 3,
        timestamp: 1_700_000_060_000
      }
    ];

    const ranked = rankRadarCandidates(current, previous, baseSettings);

    assert.equal(ranked[0].symbol, "FASTUSDT");
    assert.equal(ranked[0].alertLevel, "alert");
    assert.equal(ranked[0].direction, "up");
    assert.ok(ranked[0].movePct > 1);
    assert.ok(ranked[0].volumeBurst >= baseSettings.volumeBurstThreshold);
  });

  it("marks candidates without a previous scan as baseline rows", () => {
    const ranked = rankRadarCandidates(
      [
        {
          symbol: "BASEUSDT",
          baseAsset: "BASE",
          price: 1.25,
          quoteVolume: 12_000_000,
          change24hPct: 18,
          timestamp: 1_700_000_060_000
        }
      ],
      new Map(),
      baseSettings
    );

    assert.equal(ranked[0].hasPreviousScan, false);
    assert.equal(ranked[0].reason, "Baseline: +18% over 24h");
  });

  it("creates alert events only when move and volume thresholds pass cooldown", () => {
    const candidates = rankRadarCandidates(
      [
        {
          symbol: "PULSEUSDT",
          baseAsset: "PULSE",
          price: 196,
          quoteVolume: 22_000_000,
          change24hPct: 8,
          timestamp: 1_700_000_120_000
        }
      ],
      new Map([
        [
          "PULSEUSDT",
          {
            symbol: "PULSEUSDT",
            baseAsset: "PULSE",
            price: 200,
            quoteVolume: 20_000_000,
            change24hPct: 4,
            timestamp: 1_700_000_060_000
          }
        ]
      ]),
      baseSettings
    );

    const firstAlerts = buildAlertEvents(candidates, new Map(), baseSettings);
    const cooledDownAlerts = buildAlertEvents(
      candidates,
      new Map([["PULSEUSDT", 1_700_000_100_000]]),
      baseSettings
    );

    assert.equal(firstAlerts.length, 1);
    assert.equal(firstAlerts[0].symbol, "PULSEUSDT");
    assert.equal(firstAlerts[0].direction, "down");
    assert.match(firstAlerts[0].message, /PULSEUSDT dropping fast/);
    assert.equal(cooledDownAlerts.length, 0);
  });
});
