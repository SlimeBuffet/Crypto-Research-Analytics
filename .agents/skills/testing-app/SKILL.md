# Testing: Crypto Research Analytics

## Overview
This repo has two independent parts:
1. **Frontend**: Static HTML/JS pages (no build, open directly in browser)
2. **Backend**: TypeScript Node.js scanner-engine (`scanner-engine/` directory)

---

## Part 1: Frontend (Static HTML/JS)

### Pages
- `index.html` — Landing page / hub
- `crypto-scanner.html` — Real-time scanner (Binance API)
- `crypto-analyzer.html` — Deep analyzer (curated picks, static data)

### How to Test Locally
1. Open any HTML file directly in Chrome via `google-chrome file:///path/to/file.html`
2. No server, no dependencies, no build step required
3. Use browser DevTools (F12) to monitor Console for JS errors and Network tab for API calls

### Key Testing Scenarios

#### Scanner (`crypto-scanner.html`)
- Click "Start Scanning for 10x Gems" to run a full scan
- Scan fetches data from Binance API (`data-api.binance.vision`)
- Typical scan takes 10-20 seconds, processes 150-200+ coins
- Verify: progress bar reaches 100%, coin cards render with price/volume/sector data
- Check Network tab: all requests should go to `data-api.binance.vision` only
- Check Console: should show "Crypto 10x Scanner ready!" with no JS errors
- Note: Market Cap may show "N/A" if no external market cap data source is configured

#### Analyzer (`crypto-analyzer.html`)
- Contains static curated picks — no API calls needed to display data
- Verify: coin cards display with market cap, volume, FDV, sector tags

#### Common UI Features (all pages)
- Dark/light mode toggle (moon/sun icon in top nav)
- Theme persists in localStorage
- Export CSV button
- Watchlist (scanner page)

---

## Part 2: Backend (Scanner Engine)

### Directory Structure
- `scanner-engine/src/` — TypeScript source
- `scanner-engine/src/hedge-fund/` — Hedge Fund Intelligence Engine
  - `trigger/` — PriceChannelTrigger (ATR, volume confirmation)
  - `pillars/` — AlphaEngine, RiskEngine, MacroEngine, ExecutionEngine
  - `engine/` — HedgeFundEngine (orchestrates the pipeline)
- `scanner-engine/src/adapters/` — API adapters (Binance, CryptoRank, Mobula, etc.)
- `scanner-engine/src/hedge-fund-runner.ts` — Entry point for hedge fund pipeline

### Build & Lint Commands
```bash
cd scanner-engine
npm run typecheck    # tsc --noEmit
npm run build        # tsc (compiles to dist/)
npm run lint         # eslint src/ --ext .ts
```

### Running the Hedge Fund Pipeline
```bash
cd scanner-engine
npm run hedge-fund:dev    # ts-node src/hedge-fund-runner.ts
npm run hedge-fund        # node dist/hedge-fund-runner.js (requires build first)
```

### Pipeline Stages
The hedge fund pipeline runs through these stages in order:
1. **Stage 0**: Base Discovery (Scanner Engine — Binance pairs)
2. **Stage 1**: Price Channel Trigger (ATR + Volume filter)
3. **Stage 2**: Alpha Engine (multi-factor scoring 0-100)
4. **Stage 3**: Risk Engine (rug-pull detection, correlation)
5. **Stage 4**: Macro Engine (DXY, Fed Rate, BTC Crash Gate)
6. **Stage 5**: Execution Engine (VWAP/TWAP with Priority Queue)

### Testing Backend Features

#### Approach: Integration Test Script
When testing backend logic changes, write a temporary TypeScript test script that:
1. Imports the specific modules being tested
2. Creates controlled mock data (e.g., klines, scores)
3. Calls the module methods directly with the mock data
4. Asserts expected outputs

Example for testing PriceChannelTrigger:
```typescript
import { PriceChannelTrigger } from './hedge-fund/trigger';
const trigger = new PriceChannelTrigger({ ...config });
const result = trigger.evaluate('SYMBOL', mockKlines);
// Assert result.isTriggered, result.atr, result.volumeConfirmed, etc.
```

Example for testing ExecutionEngine priority:
```typescript
import { ExecutionEngine } from './hedge-fund/pillars';
console.log(ExecutionEngine.assignPriority(95)); // 'HIGH'
console.log(ExecutionEngine.assignPriority(80)); // 'MEDIUM'
console.log(ExecutionEngine.assignPriority(50)); // 'LOW'
```

#### Pipeline Startup Test
Run `npm run hedge-fund:dev` with a timeout to verify:
- Pipeline starts without TypeErrors
- Configuration is logged correctly (check for new config fields)
- Stage 0 discovers coins from Binance (public API, no key needed)

**Important**: Full pipeline end-to-end requires API keys for CryptoRank, Mobula, and CoinCap. Without these, Stage 2 (Enrichment) will produce 0 coins and the pipeline will exit early. Binance API is public and works without a key.

#### BTC Crash Gate Testing
The `MacroEngine.computeRiskSignal()` method is private, so test its logic by:
- Replicating the conditional logic in your test script
- Verifying against the source code (check `macro.ts` lines for `computeRiskSignal`)
- The gate locks when `isBelowEma200 && isCrashing` (BTC < EMA200 AND down > 3% in 1h)

### Environment Variables (Backend)
New trigger config (all have sensible defaults):
- `TRIGGER_ATR_PERIOD` (default: 14)
- `TRIGGER_ATR_MULTIPLIER` (default: 0.75)
- `TRIGGER_VOLUME_SMA_PERIOD` (default: 20)
- `TRIGGER_VOLUME_SPIKE_MULTIPLIER` (default: 1.5)

See `.env.example` for all available environment variables.

---

## General Environment Notes
- wmctrl may need to be installed for maximizing browser window during frontend testing: `sudo apt-get install -y wmctrl`
- `npm install` in `scanner-engine/` is required before running any backend commands
- Some external APIs (CoinCap, DexScreener) might be unreachable from certain environments — this causes Stage 2/3 failures but is not related to code changes

## Devin Secrets Needed
- **For frontend testing**: None required
- **For full backend pipeline**: `CRYPTORANK_API_KEY`, `MOBULA_API_KEY` (optional — pipeline runs partially without them)
- **For macro data**: `FRED_API_KEY` (optional — defaults to conservative estimates)
