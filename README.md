# Crypto Radar Overlay

A small floating Electron desktop overlay that watches public Binance market feeds for crypto pairs moving quickly with unusual volume.

## What It Shows

- `Move`: price change since the previous radar scan.
- `Vol Spike`: new volume since the last scan compared with the normal 24h volume pace for the same time window.
- `24h Vol`: total traded USDT volume over the last 24 hours.
- `Score`: ranking score used to decide the top 10 list.
- `Base`: first scan baseline before there is a previous scan to compare against.
- `Alert`: a coin passed both the fast-move and volume-spike thresholds.

Each coin row includes a `Why / calculation` section showing the actual formulas and values used for that coin.

## How The Numbers Are Calculated

The first scan only creates a baseline. From the second scan onward, each coin is compared with its previous scan.

`scan minutes = max((current timestamp - previous timestamp) / 60000, 1/60)`

### Move

`Move` is the percent price change since the previous scan.

```text
move % = ((current price - previous price) / previous price) x 100
```

Example: if a coin moves from `$100.00` to `$101.20`, the move is `+1.20%`.

### Speed

`Speed` is the move per minute. It helps catch a coin moving fast even if the total move is still small.

```text
speed % per minute = move % / scan minutes
```

Default speed threshold: `0.45%` per minute.

### Vol Spike

`Vol Spike` means new traded volume is happening faster than the coin's normal 24h volume pace.

```text
new volume = max(0, current 24h volume - previous 24h volume)
normal scan volume = max((current 24h volume / 1440) x scan minutes, 1)
vol spike = new volume / normal scan volume
```

Example: `2.5x` means the coin traded 2.5 times more volume during this scan than its normal 24h pace would suggest.

### 24h Vol

`24h Vol` is Binance `quoteVolume` for the USDT pair. It is used as a liquidity check, so thin coins do not dominate the radar just because they moved.

Default minimum 24h volume: `$5M`.

### Alert Level

The app checks both price movement and volume.

```text
passes move = abs(move %) >= Alert Move %
passes speed = abs(speed % per minute) >= 0.45
passes volume = vol spike >= Alert Spike x
```

- `Alert`: `(passes move OR passes speed) AND passes volume`
- `Watch`: only one side passed, either movement/speed or volume
- `Quiet`: neither side passed
- `Base`: first scan, before there is a previous scan to compare against

Default alert settings:

- `Alert Move %`: `0.7%`
- `Alert Spike x`: `2.5x`
- `Refresh`: `15s`
- `Cooldown`: `180s`

### Rank Score

The top 10 list is sorted by `Score`. Higher score means the coin is more important to look at right now.

```text
score =
  level bonus
  + abs(move %) x 42
  + abs(speed % per minute) x 18
  + min(vol spike, 35) x 8
  + log10(24h volume + 1) x 5
  + abs(24h change %) x 0.8
```

Level bonus:

- `Alert`: `200`
- `Watch`: `70`
- `Quiet` or `Base`: `0`

The volume spike part is capped at `35x` for scoring so one extreme volume print does not completely overpower everything else.

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
