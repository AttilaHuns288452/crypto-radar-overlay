# Crypto Radar Overlay

A small floating Electron desktop overlay that watches public Binance market feeds for crypto pairs moving quickly with unusual volume.

## What It Shows

- `Move`: price change since the previous radar scan.
- `Vol Spike`: current volume pace compared with the normal 24h pace.
- `24h Vol`: total traded USDT volume over the last 24 hours.
- `Base`: first scan baseline before there is a previous scan to compare against.
- `Alert`: a coin passed both the fast-move and volume-spike thresholds.

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
