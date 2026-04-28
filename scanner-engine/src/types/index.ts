// ============================================================================
// Core domain types for the Crypto Scanner Engine
// ============================================================================

/** Supported blockchain networks for on-chain verification */
export type Chain = 'bsc' | 'solana' | 'worldchain' | 'ethereum';

/** Supported API services for key rotation */
export type ApiService =
  | 'alchemy'
  | 'quicknode_http'
  | 'quicknode_wss'
  | 'cryptorank'
  | 'mobula'
  | 'coincap';

// ---------------------------------------------------------------------------
// Binance API response types
// ---------------------------------------------------------------------------

export interface BinanceExchangeInfo {
  symbols: BinanceSymbolInfo[];
}

export interface BinanceSymbolInfo {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  isSpotTradingAllowed: boolean;
}

export interface BinanceTicker24h {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  lastPrice: string;
  volume: string;
  quoteVolume: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
}

export interface BinanceKline {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
  quoteAssetVolume: string;
}

// ---------------------------------------------------------------------------
// DexScreener API response types
// ---------------------------------------------------------------------------

export interface DexScreenerPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd: string;
  liquidity: { usd: number; base: number; quote: number };
  fdv: number;
  marketCap: number;
  volume: { h24: number; h6: number; h1: number; m5: number };
  priceChange: { h24: number; h6: number; h1: number; m5: number };
  txns: {
    h24: { buys: number; sells: number };
    h6: { buys: number; sells: number };
  };
}

export interface DexScreenerResponse {
  pairs: DexScreenerPair[] | null;
}

// ---------------------------------------------------------------------------
// CryptoRank API response types
// ---------------------------------------------------------------------------

export interface CryptoRankCoin {
  id: number;
  key: string;
  name: string;
  symbol: string;
  rank: number;
  type: string;
  category: string[];
  values: {
    USD: {
      price: number;
      marketCap: number;
      fullyDilutedValuation: number;
      volume24h: number;
      circulatingSupply: number;
      maxSupply: number | null;
      totalSupply: number;
      percentChange24h: number;
      percentChange7d: number;
      percentChange30d: number;
    };
  };
}

export interface CryptoRankResponse {
  status: { success: boolean };
  data: CryptoRankCoin[];
}

// ---------------------------------------------------------------------------
// Mobula API response types
// ---------------------------------------------------------------------------

export interface MobulaCoinData {
  name: string;
  symbol: string;
  market_cap: number;
  fully_diluted_valuation: number;
  total_volume: number;
  circulating_supply: number;
  total_supply: number;
  max_supply: number | null;
  price: number;
  price_change_24h: number;
  price_change_7d: number;
  price_change_30d: number;
  tags: string[];
  contracts: Array<{ address: string; blockchain: string }>;
}

export interface MobulaResponse {
  data: MobulaCoinData;
}

export interface MobulaMultiResponse {
  data: MobulaCoinData[];
}

// ---------------------------------------------------------------------------
// CoinCap API response types (fallback)
// ---------------------------------------------------------------------------

export interface CoinCapAsset {
  id: string;
  rank: string;
  symbol: string;
  name: string;
  supply: string;
  maxSupply: string | null;
  marketCapUsd: string;
  volumeUsd24Hr: string;
  priceUsd: string;
  changePercent24Hr: string;
  vwap24Hr: string;
}

export interface CoinCapResponse {
  data: CoinCapAsset[];
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Internal domain types
// ---------------------------------------------------------------------------

/** Unified coin data after multi-source aggregation */
export interface CoinData {
  id: string;
  symbol: string;
  name: string;
  binancePair: string;
  chain: Chain | null;

  // Market data
  price: number;
  marketCap: number;
  fullyDilutedValuation: number;
  volume24h: number;
  fdvMcRatio: number;

  // Supply
  circulatingSupply: number;
  totalSupply: number;
  maxSupply: number | null;

  // Price changes
  priceChange24h: number;
  priceChange7d: number;
  priceChange30d: number;

  // On-chain metrics
  dexLiquidity: number | null;
  dexVolume24h: number | null;
  dexTxns24h: number | null;

  // Fundamentals
  sector: string;
  categories: string[];

  // Scoring
  alphaScore: number;
  scoreBreakdown: ScoreBreakdown;

  // Metadata
  dataSources: string[];
  lastUpdated: number;
}

/** Breakdown of the 0-25 Alpha Score */
export interface ScoreBreakdown {
  liquidity: number;     // 0-5
  tokenomics: number;    // 0-5
  marketCap: number;     // 0-5
  momentum: number;      // 0-5
  onChain: number;       // 0-5
}

/** Discovery result from Stage 1 */
export interface DiscoveryResult {
  symbol: string;
  baseAsset: string;
  binancePair: string;
  price: number;
  volume24h: number;
  priceChange24h: number;
}

/** Enrichment result from Stage 2 */
export interface EnrichmentData {
  marketCap: number;
  fullyDilutedValuation: number;
  circulatingSupply: number;
  totalSupply: number;
  maxSupply: number | null;
  priceChange7d: number;
  priceChange30d: number;
  sector: string;
  categories: string[];
  source: string;
}

/** On-chain verification result from Stage 3 */
export interface OnChainData {
  dexLiquidity: number;
  dexVolume24h: number;
  dexTxns24h: number;
  verifiedFdv: number | null;
  verifiedMcap: number | null;
  chain: Chain | null;
  source: string;
}

/** Scanner configuration */
export interface ScannerConfig {
  binanceBaseUrl: string;
  dexScreenerBaseUrl: string;
  concurrencyLimit: number;
  cacheTtlSeconds: number;
  minVolumeUsd: number;
  minMarketCapUsd: number;
  maxMarketCapUsd: number;
  maxFdvMcRatio: number;
  logLevel: string;
}

/** Cache entry with TTL */
export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}
