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
- `scanner-engine/src/core/` — ScannerEngine, AlphaScorer, ZScoreNormalizer, ApiKeyManager
- `scanner-engine/src/hedge-fund/` — Hedge Fund Intelligence Engine
  - `trigger/` — PriceChannelTrigger (ATR, volume confirmation)
  - `pillars/` — AlphaEngine, RiskEngine, MacroEngine, ExecutionEngine
  - `engine/` — HedgeFundEngine (orchestrates the pipeline)
- `scanner-engine/src/master/` — MasterScannerEngine (full autonomous pipeline)
- `scanner-engine/src/adapters/` — API adapters (Binance, CryptoRank, Mobula, etc.)
- `scanner-engine/src/persistence/` — SQLite + Drizzle ORM (ScanRepository)
- `scanner-engine/src/types/` — TypeScript interfaces (IBinanceAdapter, IAlphaScorer, IScannerEngine)

### Build, Lint & Test Commands
```bash
cd scanner-engine
npm run typecheck    # tsc --noEmit
npm run build        # tsc (compiles to dist/)
npm run lint         # eslint src/ --ext .ts
npm test             # vitest run (39 unit tests)
npm run test:watch   # vitest (watch mode)
```

### Unit Tests (Vitest)
The repo has 39 unit tests across 2 test suites:
- `src/__tests__/scorer.test.ts` — 26 tests for AlphaScorer (score range, breakdown sum, liquidity/tokenomics/marketCap/momentum/onChain thresholds)
- `src/__tests__/z-score-normalizer.test.ts` — 13 tests for ZScoreNormalizer (window eviction, mean, stdDev, zScore directionality, normalize fallback)

Run with `npm test`. Expected: 39 passed, 0 failed, ~500ms.

### Running the Pipelines
```bash
cd scanner-engine
npm run dev              # Scanner Engine (src/index.ts)
npm run hedge-fund:dev   # Hedge Fund Engine (src/hedge-fund-runner.ts)
npm run master:dev       # Master Scanner Engine (src/master-runner.ts)
```

### Pipeline Entry Points & Expected Behavior

#### Scanner Engine (`npm run dev`)
- Stage 1 (Discovery): Fetches Binance USDT pairs — typically 250+ candidates
- Stage 2 (Enrichment): CryptoRank + Mobula + CoinCap — needs API keys for full enrichment
- Stage 3 (On-chain): DexScreener batch fetch — ~50s for 250+ symbols
- Stage 4 (Scoring): AlphaScorer produces scores 0-25
- Expected output: "Scanner engine finished successfully" with top 20 coins listed
- Typical runtime: 50-60 seconds

#### Hedge Fund Engine (`npm run hedge-fund:dev`)
- Stage 0: Runs full ScannerEngine internally
- Stage 1: PriceChannelTrigger filters — 0 triggered is normal (market dependent)
- Stage 2-3: Alpha + Risk scoring (only if Stage 1 triggers coins)
- Stage 4: Macro Engine (DXY, Fed Rate, BTC Crash Gate)
- Stage 5: Execution Engine (VWAP/TWAP)
- Expected output: "Pipeline finished" with executionReady count
- Note: If 0 coins pass trigger, pipeline ends early — this is expected behavior
- Typical runtime: 60-90 seconds

#### Master Scanner Engine (`npm run master:dev`)
- Runs the full autonomous "Sentient Pipeline" (Ingest → Analyze → Audit → Narrate)
- Requires WebSocket connections (QuickNode WSS) for real-time data
- Typical runtime: 2-5 minutes

### Testing Backend Features

#### Unit Test Approach (Preferred)
Run `npm test` for AlphaScorer and ZScoreNormalizer. These cover the core scoring logic.

#### Integration Test Script Approach
For testing specific modules, write a temporary Node.js script that imports compiled modules from `dist/`:
```bash
npm run build  # Compile first
node -e "const { ScanRepository } = require('./dist/persistence/scan-repository'); ..."
```

#### Persistence Layer Testing
The SQLite persistence module can be tested via a Node.js script:
1. Import `getDb`, `closeDb` from `dist/persistence/db`
2. Import `ScanRepository` from `dist/persistence/scan-repository`
3. Call `saveScanResults(scanId, coins)` with mock CoinData
4. Verify `getScoreTrend(symbol)` returns inserted data
5. Verify `getScoreDelta(symbol)` computes correct direction (FLAT/UP/DOWN)
6. Check `./data/scanner.db` file exists with tables `scan_results` and `score_history`

#### Pipeline Startup Test
Run any pipeline with `timeout` to verify startup:
```bash
timeout 120 npm run dev              # Scanner
timeout 180 npm run hedge-fund:dev   # Hedge Fund
```
Verify:
- Pipeline starts without TypeErrors
- API keys are loaded (check "Loaded API keys" log lines)
- Stages progress sequentially
- Final output includes summary stats

#### BTC Crash Gate Testing
The `MacroEngine.computeRiskSignal()` method is private, so test its logic by:
- Replicating the conditional logic in your test script
- Verifying against the source code (check `macro.ts` for `computeRiskSignal`)
- The gate locks when `isBelowEma200 && isCrashing` (BTC < EMA200 AND down > 3% in 1h)

### API Key Configuration
API keys are loaded via `ApiKeyManager` from numbered env vars (e.g., `ALCHEMY_KEY_1`, `CRYPTORANK_API_KEY_1`).

Required env vars for full pipeline testing:
```
ALCHEMY_KEY_1=<key>
QUICKNODE_HTTP_BSC_1=<full_url>
QUICKNODE_WSS_1=<full_wss_url>
CRYPTORANK_API_KEY_1=<key>
MOBULA_API_KEY_1=<key>
```

Optional:
```
FRED_API_KEY=<key>           # For live DXY/Fed Rate data (macro engine)
COINCAP_API_KEY_1=<key>      # For CoinCap enrichment
LUNARCRUSH_API_KEY=<key>     # For sentiment data
DB_PATH=./data/scanner.db    # SQLite database location
```

### Environment Variables (Backend)
Trigger config (all have sensible defaults):
- `TRIGGER_ATR_PERIOD` (default: 14)
- `TRIGGER_ATR_MULTIPLIER` (default: 0.75)
- `TRIGGER_VOLUME_SMA_PERIOD` (default: 20)
- `TRIGGER_VOLUME_SPIKE_MULTIPLIER` (default: 1.5)

See `.env.example` for all available environment variables.

---

## General Environment Notes
- wmctrl may need to be installed for maximizing browser window during frontend testing: `sudo apt-get install -y wmctrl`
- `npm install` in `scanner-engine/` is required before running any backend commands
- Some external APIs (CoinCap) might be unreachable from certain environments — this causes enrichment fallbacks but is not related to code changes. The pipeline handles this gracefully.
- DexScreener batch fetch can take 40-60 seconds for 250+ symbols due to rate limiting
- All backend testing is shell-based (no browser/GUI recording needed)
- NEVER commit `.env` files — they are gitignored. Create `.env` from `.env.example` for testing.

## Devin Secrets Needed
- **For frontend testing**: None required
- **For scanner pipeline**: `CRYPTORANK_API_KEY`, `MOBULA_API_KEY` (enrichment returns 0 without these)
- **For hedge-fund pipeline**: Same as scanner + optionally `FRED_API_KEY` for live macro data
- **For master pipeline**: Same as hedge-fund + `QUICKNODE_WSS` for WebSocket streams
- **For macro data**: `FRED_API_KEY` (optional — defaults to conservative estimates without it)
