import { CoinData } from '../types';
import {
  LiquidityAnalysis,
  OrderBookDepth,
  SmartRoute,
  VwapParams,
  TwapParams,
} from '../types/hedge-fund';
import { fetchWithBackoff } from '../utils/fetcher';
import { logger } from '../utils/logger';

const BINANCE_URL = process.env.BINANCE_BASE_URL || 'https://data-api.binance.vision/api/v3';

/**
 * Pillar C: Liquidity & Execution — "The Sword"
 *
 * - Order Book Depth Analysis: minimize slippage (< 1%)
 * - VWAP/TWAP execution strategies to hide institutional footprints
 * - Smart Order Routing between Binance and top DEXs
 */
export class LiquidityExecution {
  private readonly maxSlippagePct: number;

  constructor(maxSlippagePct = 1.0) {
    this.maxSlippagePct = maxSlippagePct;
  }

  async analyze(coin: CoinData, _orderSizeUsd = 100_000): Promise<LiquidityAnalysis> {
    const orderBookDepth = await this.analyzeOrderBook(coin, _orderSizeUsd);
    const estimatedSlippage = orderBookDepth.impactFor100k;
    const smartRoute = this.calculateSmartRoute(coin, orderBookDepth);
    const recommendedStrategy = this.selectStrategy(_orderSizeUsd, orderBookDepth);
    const executable = estimatedSlippage < this.maxSlippagePct;

    return {
      orderBookDepth,
      estimatedSlippage,
      recommendedStrategy,
      smartRoute,
      executable,
    };
  }

  /** Analyze order book depth from Binance */
  private async analyzeOrderBook(
    coin: CoinData,
    _orderSizeUsd: number,
  ): Promise<OrderBookDepth> {
    try {
      const data = await fetchWithBackoff<{
        bids: string[][];
        asks: string[][];
      }>(
        `${BINANCE_URL}/depth?symbol=${coin.symbol}USDT&limit=100`,
        { label: `execution/depth/${coin.symbol}` },
      );

      let bidDepthUsd = 0;
      for (const [price, qty] of data.bids) {
        bidDepthUsd += parseFloat(price) * parseFloat(qty);
      }

      let askDepthUsd = 0;
      for (const [price, qty] of data.asks) {
        askDepthUsd += parseFloat(price) * parseFloat(qty);
      }

      const bestBid = parseFloat(data.bids[0]?.[0] || '0');
      const bestAsk = parseFloat(data.asks[0]?.[0] || '0');
      const spreadPct = bestAsk > 0 ? ((bestAsk - bestBid) / bestAsk) * 100 : 0;

      const impactFor100k = this.calculatePriceImpact(data.asks, 100_000);
      const impactFor500k = this.calculatePriceImpact(data.asks, 500_000);

      return { bidDepthUsd, askDepthUsd, spreadPct, impactFor100k, impactFor500k };
    } catch (err) {
      const error = err as Error;
      logger.warn(
        { symbol: coin.symbol, error: error.message },
        'Order book analysis failed, using estimates',
      );
      return this.estimateDepth(coin);
    }
  }

  /** Calculate price impact for a given order size */
  private calculatePriceImpact(asks: string[][], orderSizeUsd: number): number {
    if (asks.length === 0) return 5;

    let filledUsd = 0;
    let weightedPrice = 0;
    const bestPrice = parseFloat(asks[0][0]);

    for (const [priceStr, qtyStr] of asks) {
      const price = parseFloat(priceStr);
      const qty = parseFloat(qtyStr);
      const levelUsd = price * qty;
      const remaining = orderSizeUsd - filledUsd;

      if (remaining <= 0) break;

      const fillUsd = Math.min(levelUsd, remaining);
      weightedPrice += price * fillUsd;
      filledUsd += fillUsd;
    }

    if (filledUsd === 0 || bestPrice === 0) return 5;

    const avgPrice = weightedPrice / filledUsd;
    return ((avgPrice - bestPrice) / bestPrice) * 100;
  }

  /** Fallback depth estimation from volume data */
  private estimateDepth(coin: CoinData): OrderBookDepth {
    const estimatedDepth = coin.volume24h * 0.02;
    return {
      bidDepthUsd: estimatedDepth,
      askDepthUsd: estimatedDepth,
      spreadPct: 0.1,
      impactFor100k: coin.volume24h > 5_000_000 ? 0.2 : 1.5,
      impactFor500k: coin.volume24h > 5_000_000 ? 0.8 : 4.0,
    };
  }

  /** Smart Order Routing: determine optimal split between venues */
  private calculateSmartRoute(
    coin: CoinData,
    depth: OrderBookDepth,
  ): SmartRoute {
    const dexLiq = coin.dexLiquidity || 0;
    const cexDepth = depth.askDepthUsd;
    const total = dexLiq + cexDepth;

    let binanceRatio = 1.0;
    let dexRatio = 0;

    if (total > 0 && dexLiq > 50_000) {
      binanceRatio = cexDepth / total;
      dexRatio = dexLiq / total;

      // Cap DEX routing at 40% to minimize on-chain slippage
      if (dexRatio > 0.4) {
        dexRatio = 0.4;
        binanceRatio = 0.6;
      }
    }

    const splitRatio: Record<string, number> = {
      binance: Math.round(binanceRatio * 100),
    };
    if (dexRatio > 0) {
      splitRatio.dex = Math.round(dexRatio * 100);
    }

    return {
      primaryVenue: 'binance',
      splitRatio,
      estimatedFillPrice: coin.price,
      estimatedSlippage: depth.impactFor100k,
    };
  }

  /** Select optimal execution strategy based on order size and depth */
  private selectStrategy(
    orderSizeUsd: number,
    depth: OrderBookDepth,
  ): 'VWAP' | 'TWAP' | 'ICEBERG' | 'MARKET' {
    const totalDepth = depth.bidDepthUsd + depth.askDepthUsd;

    // Small orders relative to depth → market order
    if (orderSizeUsd < totalDepth * 0.01) return 'MARKET';

    // Medium orders → TWAP to spread execution
    if (orderSizeUsd < totalDepth * 0.05) return 'TWAP';

    // Large orders with good spread → VWAP for volume-matching
    if (depth.spreadPct < 0.1) return 'VWAP';

    // Large orders with wide spread → ICEBERG to hide size
    return 'ICEBERG';
  }

  /** Generate VWAP execution parameters */
  generateVwapParams(
    totalQuantity: number,
    durationMinutes = 60,
  ): VwapParams {
    return {
      totalQuantity,
      durationMinutes,
      intervalMinutes: Math.max(1, Math.floor(durationMinutes / 20)),
      maxSlippagePct: this.maxSlippagePct,
    };
  }

  /** Generate TWAP execution parameters */
  generateTwapParams(
    totalQuantity: number,
    durationMinutes = 60,
    numSlices = 10,
  ): TwapParams {
    return {
      totalQuantity,
      durationMinutes,
      numSlices,
      randomization: 0.2,
    };
  }
}
