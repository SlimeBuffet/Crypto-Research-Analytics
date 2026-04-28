import {
  BinanceExchangeInfo,
  BinanceSymbolInfo,
  BinanceTicker24h,
  BinanceKline,
  DiscoveryResult,
} from '../types';
import { fetchWithBackoff } from '../utils/fetcher';
import { logger } from '../utils/logger';

const BASE_URL = process.env.BINANCE_BASE_URL || 'https://data-api.binance.vision/api/v3';

/**
 * Binance API adapter — Stage 1: Discovery.
 * Fetches active USDT trading pairs and 24h ticker data.
 */
export class BinanceAdapter {
  /** Fetch all active USDT trading pairs */
  async fetchUsdtPairs(): Promise<BinanceSymbolInfo[]> {
    logger.info('Fetching Binance exchange info...');

    const data = await fetchWithBackoff<BinanceExchangeInfo>(
      `${BASE_URL}/exchangeInfo`,
      { label: 'binance/exchangeInfo' },
    );

    const usdtPairs = data.symbols.filter(
      (s) =>
        s.quoteAsset === 'USDT' &&
        s.status === 'TRADING' &&
        s.isSpotTradingAllowed,
    );

    logger.info({ count: usdtPairs.length }, 'Found active USDT pairs');
    return usdtPairs;
  }

  /** Fetch 24h ticker data for all symbols */
  async fetch24hTickers(): Promise<Map<string, BinanceTicker24h>> {
    logger.info('Fetching Binance 24h tickers...');

    const data = await fetchWithBackoff<BinanceTicker24h[]>(
      `${BASE_URL}/ticker/24hr`,
      { label: 'binance/ticker24hr' },
    );

    const tickerMap = new Map<string, BinanceTicker24h>();
    for (const ticker of data) {
      if (ticker.symbol.endsWith('USDT')) {
        tickerMap.set(ticker.symbol.slice(0, -4), ticker);
      }
    }

    logger.info({ count: tickerMap.size }, 'Loaded 24h tickers');
    return tickerMap;
  }

  /** Fetch kline/candlestick data for a symbol */
  async fetchKlines(
    symbol: string,
    interval = '1d',
    limit = 30,
  ): Promise<BinanceKline[]> {
    const rawData = await fetchWithBackoff<unknown[][]>(
      `${BASE_URL}/klines?symbol=${symbol}USDT&interval=${interval}&limit=${limit}`,
      { label: `binance/klines/${symbol}` },
    );

    return rawData.map((k) => ({
      openTime: k[0] as number,
      open: k[1] as string,
      high: k[2] as string,
      low: k[3] as string,
      close: k[4] as string,
      volume: k[5] as string,
      closeTime: k[6] as number,
      quoteAssetVolume: k[7] as string,
    }));
  }

  /**
   * Stage 1: Discovery — find active coins with sufficient volume.
   */
  async discover(minVolumeUsd: number): Promise<DiscoveryResult[]> {
    const [pairs, tickers] = await Promise.all([
      this.fetchUsdtPairs(),
      this.fetch24hTickers(),
    ]);

    const pairSet = new Set(pairs.map((p) => p.baseAsset));
    const results: DiscoveryResult[] = [];

    for (const [baseAsset, ticker] of tickers) {
      if (!pairSet.has(baseAsset)) continue;

      const volume = parseFloat(ticker.quoteVolume);
      const price = parseFloat(ticker.lastPrice);
      const priceChange = parseFloat(ticker.priceChangePercent);

      if (volume < minVolumeUsd || price <= 0) continue;

      results.push({
        symbol: baseAsset,
        baseAsset,
        binancePair: `${baseAsset}USDT`,
        price,
        volume24h: volume,
        priceChange24h: priceChange,
      });
    }

    logger.info(
      { total: results.length, minVolumeUsd },
      'Stage 1 Discovery complete',
    );
    return results;
  }
}
