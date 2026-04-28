import {
  CoinData,
  DiscoveryResult,
  EnrichmentData,
  OnChainData,
  ScannerConfig,
} from '../types';
import { ApiKeyManager } from './api-key-manager';
import { AlphaScorer } from './scorer';
import {
  BinanceAdapter,
  CryptoRankAdapter,
  MobulaAdapter,
  DexScreenerAdapter,
  RpcAdapter,
  CoinCapAdapter,
} from '../adapters';
import { TtlCache } from '../utils/cache';
import { logger } from '../utils/logger';

/**
 * Main Scanner Engine — orchestrates the 4-stage data pipeline.
 *
 * Stage 1: Discovery    — Binance (active USDT pairs, volume filter)
 * Stage 2: Enrichment   — CryptoRank + Mobula (fundamentals, sectors)
 * Stage 3: On-chain     — DexScreener + RPC (liquidity, FDV verification)
 * Stage 4: Scoring      — Alpha Score (0-25)
 */
export class ScannerEngine {
  private config: ScannerConfig;
  private keyManager: ApiKeyManager;
  private cache: TtlCache;
  private scorer: AlphaScorer;

  // Adapters
  private binance: BinanceAdapter;
  private cryptoRank: CryptoRankAdapter;
  private mobula: MobulaAdapter;
  private dexScreener: DexScreenerAdapter;
  private rpc: RpcAdapter;
  private coinCap: CoinCapAdapter;

  constructor() {
    this.config = this.loadConfig();
    this.keyManager = new ApiKeyManager();
    this.cache = new TtlCache(this.config.cacheTtlSeconds);
    this.scorer = new AlphaScorer();

    this.binance = new BinanceAdapter();
    this.cryptoRank = new CryptoRankAdapter(this.keyManager, this.cache);
    this.mobula = new MobulaAdapter(this.keyManager, this.cache);
    this.dexScreener = new DexScreenerAdapter(this.cache);
    this.rpc = new RpcAdapter(this.keyManager);
    this.coinCap = new CoinCapAdapter(this.keyManager, this.cache);
  }

  private loadConfig(): ScannerConfig {
    return {
      binanceBaseUrl:
        process.env.BINANCE_BASE_URL || 'https://data-api.binance.vision/api/v3',
      dexScreenerBaseUrl:
        process.env.DEXSCREENER_BASE_URL || 'https://api.dexscreener.com/latest',
      concurrencyLimit: parseInt(process.env.CONCURRENCY_LIMIT || '5', 10),
      cacheTtlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '21600', 10),
      minVolumeUsd: parseFloat(process.env.MIN_VOLUME_USD || '500000'),
      minMarketCapUsd: parseFloat(process.env.MIN_MARKET_CAP_USD || '10000000'),
      maxMarketCapUsd: parseFloat(process.env.MAX_MARKET_CAP_USD || '500000000'),
      maxFdvMcRatio: parseFloat(process.env.MAX_FDV_MC_RATIO || '2.5'),
      logLevel: process.env.LOG_LEVEL || 'info',
    };
  }

  /**
   * Execute the full 4-stage scan pipeline.
   * Returns scored & sorted coin data.
   */
  async scan(): Promise<CoinData[]> {
    const startTime = Date.now();
    logger.info('========== SCANNER ENGINE START ==========');
    logger.info({ config: this.config }, 'Configuration loaded');

    // ------------------------------------------------------------------
    // Stage 1: Discovery
    // ------------------------------------------------------------------
    logger.info('--- Stage 1: Discovery (Binance) ---');
    const discoveries = await this.binance.discover(this.config.minVolumeUsd);
    logger.info({ candidates: discoveries.length }, 'Stage 1 complete');

    // ------------------------------------------------------------------
    // Stage 2: Enrichment
    // ------------------------------------------------------------------
    logger.info('--- Stage 2: Enrichment (CryptoRank + Mobula) ---');
    const symbols = discoveries.map((d) => d.symbol);
    const enrichments = await this.enrichBatch(symbols);
    logger.info({ enriched: enrichments.size }, 'Stage 2 complete');

    // ------------------------------------------------------------------
    // Stage 3: On-chain verification
    // ------------------------------------------------------------------
    logger.info('--- Stage 3: On-chain Check (DexScreener + RPC) ---');
    const onChainData = await this.dexScreener.fetchBatch(symbols);
    logger.info({ verified: onChainData.size }, 'Stage 3 complete');

    // ------------------------------------------------------------------
    // Stage 4: Scoring & Assembly
    // ------------------------------------------------------------------
    logger.info('--- Stage 4: Scoring ---');
    const coins = this.assembleAndScore(discoveries, enrichments, onChainData);

    // Apply market cap and FDV/MC filters on enriched data
    const filtered = coins.filter((c) => {
      if (c.marketCap > 0) {
        if (c.marketCap < this.config.minMarketCapUsd) return false;
        if (c.marketCap > this.config.maxMarketCapUsd) return false;
        if (c.fdvMcRatio > this.config.maxFdvMcRatio) return false;
      }
      return true;
    });

    // Sort by Alpha Score descending
    filtered.sort((a, b) => b.alphaScore - a.alphaScore);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(
      {
        total: discoveries.length,
        enriched: enrichments.size,
        onChainVerified: onChainData.size,
        afterFilters: filtered.length,
        elapsed: `${elapsed}s`,
      },
      '========== SCAN COMPLETE ==========',
    );

    // Log key usage stats
    logger.info({ keyStats: this.keyManager.getStats() }, 'API key usage');
    logger.info({ cacheSize: this.cache.size }, 'Cache stats');

    return filtered;
  }

  /**
   * Stage 2: Try CryptoRank → Mobula → CoinCap (fallback chain).
   */
  private async enrichBatch(
    symbols: string[],
  ): Promise<Map<string, EnrichmentData>> {
    const merged = new Map<string, EnrichmentData>();

    // Primary: CryptoRank
    if (this.keyManager.hasKeys('cryptorank')) {
      const crData = await this.cryptoRank.fetchCoinData(symbols);
      for (const [sym, data] of crData) merged.set(sym, data);
    }

    // Fill gaps with Mobula
    const missingAfterCR = symbols.filter((s) => !merged.has(s));
    if (missingAfterCR.length > 0 && this.keyManager.hasKeys('mobula')) {
      const mobulaData = await this.mobula.fetchCoinData(missingAfterCR);
      for (const [sym, data] of mobulaData) merged.set(sym, data);
    }

    // Fallback: CoinCap for remaining
    const missingAfterMobula = symbols.filter((s) => !merged.has(s));
    if (missingAfterMobula.length > 0) {
      const coinCapData = await this.coinCap.fetchCoinData(missingAfterMobula);
      for (const [sym, data] of coinCapData) merged.set(sym, data);
    }

    return merged;
  }

  /**
   * Assemble final CoinData objects and calculate Alpha Scores.
   */
  private assembleAndScore(
    discoveries: DiscoveryResult[],
    enrichments: Map<string, EnrichmentData>,
    onChainData: Map<string, OnChainData>,
  ): CoinData[] {
    const results: CoinData[] = [];

    for (const disc of discoveries) {
      const enrich = enrichments.get(disc.symbol);
      const onChain = onChainData.get(disc.symbol);

      const marketCap = enrich?.marketCap || 0;
      const fdv = enrich?.fullyDilutedValuation || 0;

      const coin: CoinData = {
        id: disc.symbol.toLowerCase(),
        symbol: disc.symbol,
        name: enrich?.name || disc.symbol,
        binancePair: disc.binancePair,
        chain: onChain?.chain || null,

        price: disc.price,
        marketCap,
        fullyDilutedValuation: fdv,
        volume24h: disc.volume24h,
        fdvMcRatio: marketCap > 0 ? fdv / marketCap : 0,

        circulatingSupply: enrich?.circulatingSupply || 0,
        totalSupply: enrich?.totalSupply || 0,
        maxSupply: enrich?.maxSupply || null,

        priceChange24h: disc.priceChange24h,
        priceChange7d: enrich?.priceChange7d || 0,
        priceChange30d: enrich?.priceChange30d || 0,

        dexLiquidity: onChain?.dexLiquidity || null,
        dexVolume24h: onChain?.dexVolume24h || null,
        dexTxns24h: onChain?.dexTxns24h || null,

        sector: enrich?.sector || 'Other',
        categories: enrich?.categories || [],

        alphaScore: 0,
        scoreBreakdown: {
          liquidity: 0,
          tokenomics: 0,
          marketCap: 0,
          momentum: 0,
          onChain: 0,
        },

        dataSources: [
          'binance',
          ...(enrich ? [enrich.source] : []),
          ...(onChain ? [onChain.source] : []),
        ],
        lastUpdated: Date.now(),
      };

      const { score, breakdown } = this.scorer.calculate(coin);
      coin.alphaScore = score;
      coin.scoreBreakdown = breakdown;

      results.push(coin);
    }

    return results;
  }
}
