# Crypto Scanner Engine

A high-performance, production-ready scanner engine built with **Node.js/TypeScript** for the Crypto Research & Analytics Hub. Identifies coins with 10x upside potential by aggregating data from **CEX** (Binance) and **DEX/On-chain** sources.

## Hybrid Data Aggregation Architecture

This system uses a **Hybrid Data Aggregation** approach — combining **Off-chain (CEX)** and **On-chain (DEX)** data for maximum accuracy:

```
┌─────────────────────────────────────────────────────────────────┐
│                    SCANNER ENGINE PIPELINE                      │
├─────────────┬──────────────┬──────────────┬────────────────────┤
│  Stage 1    │   Stage 2    │   Stage 3    │     Stage 4        │
│  Discovery  │  Enrichment  │  On-chain    │     Scoring        │
│  (Binance)  │  (CryptoRank │  (DexScreener│  (Alpha Score      │
│             │   Mobula,    │   Alchemy,   │   0-25)            │
│             │   CoinCap)   │   QuickNode) │                    │
├─────────────┼──────────────┼──────────────┼────────────────────┤
│ • USDT pairs│ • Market Cap │ • DEX FDV    │ • Liquidity    0-5 │
│ • 24h volume│ • FDV/Supply │ • Liquidity  │ • Tokenomics   0-5 │
│ • Price data│ • Sector tags│ • Txn count  │ • Market Cap   0-5 │
│             │ • Categories │ • Chain ID   │ • Momentum     0-5 │
│             │   (AI, RWA,  │              │ • On-chain     0-5 │
│             │    DePIN)    │              │                    │
└─────────────┴──────────────┴──────────────┴────────────────────┘
         Off-chain (CEX)              On-chain (DEX)
```

## Features

- **Multi-API Integration**: Binance, DexScreener, CryptoRank, Mobula, CoinCap, Alchemy, QuickNode
- **API Key Rotation**: Round-robin and least-used strategies across multiple keys per service
- **Concurrency Control**: `p-limit`-based request throttling to prevent 429 errors
- **Exponential Backoff**: Automatic retry with jittered delays for failed requests
- **TTL Cache**: In-memory cache for non-volatile data (sector tags, max supply) — 6-12 hour TTL
- **Alpha Score**: 0-25 scoring across liquidity, tokenomics, market cap, momentum, and on-chain metrics
- **Structured Logging**: `pino` with API key masking for secure logs
- **TypeScript**: Full type safety with interfaces for all API responses

## Directory Structure

```
scanner-engine/
├── src/
│   ├── adapters/           # API-specific adapters
│   │   ├── binance.ts      # Binance market data (Stage 1)
│   │   ├── cryptorank.ts   # CryptoRank fundamentals (Stage 2)
│   │   ├── mobula.ts       # Mobula fundamentals (Stage 2)
│   │   ├── coincap.ts      # CoinCap fallback (Stage 2)
│   │   ├── dexscreener.ts  # DexScreener on-chain (Stage 3)
│   │   ├── rpc.ts          # Alchemy/QuickNode RPC (Stage 3)
│   │   └── index.ts
│   ├── core/               # Core engine logic
│   │   ├── api-key-manager.ts  # API key rotation manager
│   │   ├── scanner-engine.ts   # Main pipeline orchestrator
│   │   ├── scorer.ts           # Alpha Score calculator
│   │   └── index.ts
│   ├── types/              # TypeScript interfaces
│   │   └── index.ts
│   ├── utils/              # Shared utilities
│   │   ├── cache.ts        # TTL cache implementation
│   │   ├── fetcher.ts      # HTTP client with backoff + concurrency
│   │   └── logger.ts       # Pino logger with key masking
│   └── index.ts            # Entry point
├── .env.example            # Environment template
├── .eslintrc.json
├── package.json
├── tsconfig.json
└── README.md
```

## Quick Start

```bash
cd scanner-engine

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Build TypeScript
npm run build

# Run scanner
npm start

# Or run in dev mode (ts-node)
npm run dev
```

## Configuration

All configuration is via environment variables (`.env` file). See [.env.example](.env.example) for all options.

### API Keys

The system supports **multiple keys per service** for rotation:

```env
ALCHEMY_KEY_1=key_one
ALCHEMY_KEY_2=key_two
ALCHEMY_KEY_3=key_three
```

Keys are automatically loaded and rotated using round-robin logic. If a key hits a rate limit, it's placed on cooldown and the next key is used.

### Scanner Parameters

| Variable | Default | Description |
|----------|---------|-------------|
| `CONCURRENCY_LIMIT` | `5` | Max concurrent API requests |
| `CACHE_TTL_SECONDS` | `21600` | Cache TTL (6 hours) |
| `MIN_VOLUME_USD` | `500000` | Minimum 24h volume filter |
| `MIN_MARKET_CAP_USD` | `10000000` | Min market cap for 10x screening |
| `MAX_MARKET_CAP_USD` | `500000000` | Max market cap for 10x screening |
| `MAX_FDV_MC_RATIO` | `2.5` | Maximum FDV/MC ratio filter |

## Alpha Score (0-25)

Each coin is scored across 5 dimensions:

| Dimension | Max | Criteria |
|-----------|-----|----------|
| **Liquidity** | 5 | CEX volume/MC ratio + DEX liquidity depth |
| **Tokenomics** | 5 | FDV/MC ratio + circulating/max supply ratio |
| **Market Cap** | 5 | Lower MC = higher score (10x potential) |
| **Momentum** | 5 | 7d & 30d price change trends |
| **On-chain** | 5 | DEX transactions, DEX/CEX volume ratio, liquidity/MC ratio |

## Hedge Fund Intelligence & Execution Engine

A comprehensive institutional-grade system that extends the Scanner Engine with a 5-stage pipeline for identifying and executing high-alpha opportunities.

### Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                 HEDGE FUND INTELLIGENCE PIPELINE                     │
├──────────────┬─────────────┬────────────┬──────────┬─────────────────┤
│  Stage 1     │  Stage 2    │  Stage 3   │ Stage 4  │    Stage 5      │
│  TRIGGER     │  ALPHA      │  RISK      │ MACRO    │  EXECUTION      │
│  (Filter)    │  (Brain)    │  (Shield)  │ (Compass)│  (Sword)        │
├──────────────┼─────────────┼────────────┼──────────┼─────────────────┤
│ SMA Price    │ Value Score │ Correlation│ DXY Index│ Order Book      │
│ Channel      │ Momentum vs │ Matrix     │ Fed Rates│ Depth Analysis  │
│ High(8,5)    │ BTC ROC     │ VaR (95%)  │ Risk     │ VWAP/TWAP       │
│ Low(8,5)     │ Sentiment   │ Security   │ Multiplier│ Smart Order    │
│ Price > High │ Whale Flow  │ Audit      │ Signal   │ Routing         │
└──────────────┴─────────────┴────────────┴──────────┴─────────────────┘
```

### Workflow Components

| Component       | Function            | Behavior                                      |
|-----------------|---------------------|-----------------------------------------------|
| Trigger Unit    | SMA High/Low (8,5)  | Determines which coins to inspect further     |
| Intelligence    | Alpha & Sentiment   | Verifies the truth behind price movements     |
| Gatekeeper      | Risk & Security     | Blocks scam tokens or highly correlated assets|
| Macro Unit      | DXY & Rates         | Green/Yellow/Red signal based on global macro |
| Execution Unit  | VWAP/TWAP           | Enter positions smoothly to minimize slippage |

### Quick Start (Hedge Fund Engine)

```bash
cd scanner-engine

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Build TypeScript
npm run build

# Run the hedge fund pipeline
npm run hedge-fund

# Or in dev mode
npm run hedge-fund:dev
```

### Configuration

| Variable               | Default  | Description                                 |
|------------------------|----------|---------------------------------------------|
| `TRIGGER_HIGH_PERIOD`  | `8`      | Lookback period for highest highs           |
| `TRIGGER_LOW_PERIOD`   | `8`      | Lookback period for lowest lows             |
| `TRIGGER_SMA_PERIOD`   | `5`      | SMA smoothing period for channel lines      |
| `TRIGGER_OFFSET`       | `0`      | Channel offset                              |
| `MAX_CORRELATION`      | `0.8`    | Maximum pairwise correlation allowed        |
| `MAX_SLIPPAGE_PCT`     | `1.0`    | Maximum acceptable slippage percentage      |
| `POSITION_SIZE_USD`    | `100000` | Default position size in USD                |
| `MAX_OPEN_POSITIONS`   | `10`     | Maximum concurrent open positions           |
| `EXECUTION_TYPE`       | `VWAP`   | Execution strategy: VWAP or TWAP            |
| `EXECUTION_SLICES`     | `10`     | Number of execution slices                  |
| `EXECUTION_INTERVAL_MS`| `60000`  | Interval between execution slices (ms)      |
| `MACRO_ENABLED`        | `true`   | Enable/disable macro overlay                |
| `FRED_API_KEY`         | —        | FRED API key for DXY & Fed rate data        |

### Directory Structure (Hedge Fund Extension)

```
scanner-engine/src/hedge-fund/
├── types.ts                    # Domain types for all pillars
├── index.ts                    # Public API exports
├── trigger/
│   ├── price-channel.ts        # SMA High/Low Price Channel Filter
│   └── index.ts
├── pillars/
│   ├── alpha.ts                # Pillar A: Multi-Factor Alpha
│   ├── risk.ts                 # Pillar B: Quantitative Risk Engine
│   ├── execution.ts            # Pillar C: Liquidity & Execution
│   ├── macro.ts                # Pillar D: Global Macro Overlay
│   └── index.ts
└── engine/
    ├── hedge-fund-engine.ts    # Main pipeline orchestrator
    └── index.ts
```

## Master Level Architecture — Autonomous Alpha Engine

The Master Level transforms the scanner from a "Data Fetcher" into an **Autonomous Alpha Engine** using an Event-Driven Micro-Kernel architecture with 4 analytical layers and 4 premium modules.

### Architecture: The "Sentient" Pipeline

```
╔══════════════════════════════════════════════════════════════════════════╗
║                    MASTER SCANNER ENGINE v1.0.0                         ║
║               "From Data Fetcher to Autonomous Alpha Engine"            ║
╠═════════════════════════════════════════════════════════════════════════╣
║                                                                         ║
║  Layer 1: INGESTOR (Stream-First)                                       ║
║  ├── WebSocket Streams (Binance Order Book + Aggregated Trades)         ║
║  ├── Volume Profile Builder (POC, Value Area)                           ║
║  └── Helius RPC (Solana Graduated Token Detection)                      ║
║                          ↓                                              ║
║  Layer 2: PATTERN BRAIN (SMC & Liquidity)                               ║
║  ├── Market Structure Shift (MSS) Detection                             ║
║  ├── Order Block (OB) Identification                                    ║
║  ├── Fair Value Gap (FVG) Detection                                     ║
║  └── Dynamic Scoring: (Σw_i·S_i / V_volatility) × C_correlation        ║
║                          ↓                                              ║
║  Layer 3: FORENSIC SHIELD (Security Engine)                             ║
║  ├── Contract Analysis (mint, proxy, honeypot via GoPlus)               ║
║  ├── Liquidity Lock Verification                                        ║
║  └── Whale Tracking (Top 10 wallet concentration)                       ║
║                          ↓                                              ║
║  Layer 4: AGENTIC ORCHESTRATOR (Alpha Narrator)                         ║
║  ├── Chain-of-Thought Reasoning Engine                                  ║
║  ├── Verdict: ULTRA_GEM | STRONG_BUY | BUY | NEUTRAL | AVOID           ║
║  └── Narrative: "Why this coin is valid" with catalysts & risks         ║
║                                                                         ║
║  Premium Modules:                                                       ║
║  ├── Smart Money Convergence (Liquidity Grab + Rejection Detection)     ║
║  ├── Anti-Manipulation Guard (Wash Trading, Pump & Dump Detection)      ║
║  ├── Automated Narrative Mapper (Trending narrative boost)              ║
║  └── Auto-Optimizer (Historical weight tuning for better predictions)   ║
╚══════════════════════════════════════════════════════════════════════════╝
```

### Dynamic Scoring Formula

```
FinalScore = ( Σ(w_i × S_i) / V_volatility ) × C_correlation
```

- **w_i**: Weight for each scoring dimension (liquidity, tokenomics, SMC, forensic, etc.)
- **S_i**: Individual dimension score
- **V_volatility**: Volatility divisor (higher volatility = lower score)
- **C_correlation**: BTC correlation penalty (high correlation = 30% penalty)

### Quick Start (Master Engine)

```bash
cd scanner-engine

# Install dependencies
npm install

# Configure environment
cp .env.example .env

# Run the master pipeline
npm run master:dev
```

### Directory Structure (Master Level)

```
scanner-engine/src/master/
├── types.ts                           # All domain types for 4 layers + modules
├── index.ts                           # Barrel export
├── ingestor/
│   ├── stream-ingestor.ts             # Layer 1: WebSocket stream-first ingestor
│   └── index.ts
├── pattern-brain/
│   ├── smc-processor.ts               # Layer 2: SMC analysis (OB, FVG, MSS)
│   ├── dynamic-scorer.ts              # Layer 2b: Master scoring formula
│   └── index.ts
├── forensic-shield/
│   ├── forensic-audit.ts              # Layer 3: Contract security + whale tracking
│   └── index.ts
├── agentic-orchestrator/
│   ├── alpha-narrator.ts              # Layer 4: Reasoning engine + narrative
│   └── index.ts
├── modules/
│   ├── smc-convergence.ts             # Smart Money Convergence (Ultra Gem detection)
│   ├── anti-manipulation.ts           # Anti-Manipulation Guard (wash trading)
│   ├── narrative-mapper.ts            # Automated Narrative Mapper
│   └── index.ts
├── optimizer/
│   ├── auto-optimizer.ts              # Auto-Optimization (weight tuning)
│   └── index.ts
└── engine/
    ├── master-scanner-engine.ts       # Pipeline orchestrator
    └── index.ts
```

## Security

- All API keys loaded exclusively from `.env` (never hardcoded)
- `.env` is in `.gitignore` — only `.env.example` is committed
- API keys are **masked** in all log output (e.g., `UgHa...4d49`)
- No secrets exposed in console output or log files
