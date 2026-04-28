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
│   │   ├── api-key-manager.ts    # API key rotation manager
│   │   ├── scanner-engine.ts     # 4-stage pipeline orchestrator
│   │   ├── hedge-fund-engine.ts  # Hedge Fund 5-unit orchestrator
│   │   ├── scorer.ts             # Alpha Score calculator
│   │   └── index.ts
│   ├── trigger/            # Technical trigger filters
│   │   ├── price-channel.ts  # SMA High/Low (8,5) filter
│   │   └── index.ts
│   ├── pillars/            # 4-Pillar analysis modules
│   │   ├── alpha-intelligence.ts  # Pillar A: Multi-Factor Alpha
│   │   ├── risk-engine.ts         # Pillar B: Risk & Security
│   │   ├── liquidity-execution.ts # Pillar C: Execution & Routing
│   │   ├── macro-overlay.ts       # Pillar D: DXY & Macro
│   │   └── index.ts
│   ├── types/              # TypeScript interfaces
│   │   ├── index.ts        # Core scanner types
│   │   └── hedge-fund.ts   # Hedge fund system types
│   ├── utils/              # Shared utilities
│   │   ├── cache.ts        # TTL cache implementation
│   │   ├── fetcher.ts      # HTTP client with backoff + concurrency
│   │   └── logger.ts       # Pino logger with key masking
│   └── index.ts            # Entry point (scanner / hedge-fund mode)
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

On top of the base scanner, the system implements a **4-Pillar institutional analysis model** with a technical trigger:

```
╔══════════════════════════════════════════════════════════════════════╗
║           HEDGE FUND INTELLIGENCE & EXECUTION SYSTEM                ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  ┌─────────────┐                                                     ║
║  │ Trigger Unit │  SMA High/Low (8,5) — "Institutional Inflow State" ║
║  │   (Filter)   │  Price > High Line → Proceed to analysis           ║
║  └──────┬──────┘                                                     ║
║         │                                                            ║
║  ┌──────▼──────────────────────────────────────────────────────┐     ║
║  │               4-PILLAR VERIFICATION SCAN                     │     ║
║  ├──────────────┬──────────────┬──────────────┬────────────────┤     ║
║  │  Pillar A    │  Pillar B    │  Pillar C    │   Pillar D     │     ║
║  │  The Brain   │  The Shield  │  The Sword   │   The Compass  │     ║
║  │              │              │              │                │     ║
║  │ • Value Score│ • Correlation│ • Order Book │ • DXY Level    │     ║
║  │ • Momentum   │   Matrix     │   Depth      │ • Fed Rates    │     ║
║  │   vs BTC     │ • VaR (95%)  │ • VWAP/TWAP  │ • Breakout     │     ║
║  │ • Sentiment  │ • Security   │ • Smart Route│   Detection    │     ║
║  │ • Whale Flow │   Audit      │ • Slippage   │ • Risk Mult.   │     ║
║  └──────────────┴──────────────┴──────────────┴────────────────┘     ║
║         │                                                            ║
║  ┌──────▼──────┐                                                     ║
║  │   Verdict    │  STRONG_BUY │ BUY │ WATCH │ REJECT                 ║
║  │  + Position  │  Composite score + position sizing                 ║
║  └─────────────┘                                                     ║
╚══════════════════════════════════════════════════════════════════════╝
```

### Running Hedge Fund Mode

```bash
# Development
npm run dev:hf

# Production
npm run start:hf

# Or set ENGINE_MODE=hedge-fund in .env
```

### Workflow Architecture

| Component | Function | System Behavior |
|-----------|----------|-----------------|
| **Trigger Unit** | SMA High/Low (8,5) | Determines which coins qualify for deeper analysis |
| **Intelligence Unit** | Alpha & Sentiment | Finds the "truth" behind price movements (Whale/Narrative) |
| **Gatekeeper Unit** | Risk & Security | Blocks scam coins and prevents sector over-exposure |
| **Macro Unit** | DXY & Rates | Provides "green light" or "yellow light" based on global conditions |
| **Execution Unit** | VWAP/TWAP | Enters positions smoothly without market impact |

### Hedge Fund Parameters

| Variable | Default | Description |
|----------|---------|-------------|
| `ENGINE_MODE` | `scanner` | `scanner` or `hedge-fund` |
| `SMA_HIGH_PERIOD` | `8` | Price channel high period |
| `SMA_SMOOTH_PERIOD` | `5` | SMA smoothing period |
| `CORRELATION_THRESHOLD` | `0.8` | Max correlation for portfolio diversification |
| `VAR_CONFIDENCE` | `0.95` | Value at Risk confidence level |
| `MAX_SLIPPAGE_PCT` | `1.0` | Max acceptable execution slippage |
| `MAX_POSITION_SIZE_PCT` | `5.0` | Max position size as % of portfolio |
| `DXY_BREAKOUT_THRESHOLD` | `2.0` | DXY breakout sensitivity (std devs) |

## Security

- All API keys loaded exclusively from `.env` (never hardcoded)
- `.env` is in `.gitignore` — only `.env.example` is committed
- API keys are **masked** in all log output (e.g., `UgHa...4d49`)
- No secrets exposed in console output or log files
