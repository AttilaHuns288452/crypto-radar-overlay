# Crypto Radar Overlay

A small floating Electron desktop overlay that watches public Binance market feeds for crypto pairs moving quickly with unusual volume.

## What It Shows

- `Move`: price change since the previous radar scan.
  - Formula: `((current price - previous price) / previous price) x 100`.
- `Vol Spike`: new volume since the last scan compared with the normal 24h volume pace for the same time window.
  - Formula: `(current 24h volume - previous 24h volume) / ((current 24h volume / 1440) x scan minutes)`.
- `24h Vol`: total traded USDT volume over the last 24 hours.
- `Score`: ranking score used to decide the top 10 list.
  - Formula: alert/watch level + move points + speed points + volume-burst points + liquidity points + 24h-change points.
- `Base`: first scan baseline before there is a previous scan to compare against.
- `Alert`: a coin passed both the fast-move and volume-spike thresholds.

Each coin row includes a `Why / calculation` section showing the actual formulas and values used for that coin.

## Run

```powershell
npm install
npm run dev
```

After the first build, you can run:

```powershell
npm run start
```

## Test

```powershell
npm run test
npm run smoke
```

## Notes

This is a local monitoring tool, not financial advice. Verify exchange liquidity, spreads, slippage, and risk before trading.
