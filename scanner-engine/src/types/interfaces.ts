// ============================================================================
// Dependency Injection Interfaces (IoC Contracts)
//
// These interfaces decouple engine constructors from concrete adapter classes,
// enabling unit-test mocking and preventing duplicate instantiation.
// ============================================================================

import {
  BinanceKline,
  BinanceSymbolInfo,
  BinanceTicker24h,
  DiscoveryResult,
  CoinData,
  ScoreBreakdown,
} from './index';

/**
 * Contract for any adapter that provides Binance-compatible market data.
 * Engines depend on this interface, not on the concrete BinanceAdapter class.
 */
export interface IBinanceAdapter {
  fetchUsdtPairs(): Promise<BinanceSymbolInfo[]>;
  fetch24hTickers(): Promise<Map<string, BinanceTicker24h>>;
  fetchKlines(symbol: string, interval?: string, limit?: number): Promise<BinanceKline[]>;
  discover(minVolumeUsd: number): Promise<DiscoveryResult[]>;
}

/**
 * Contract for the Alpha Score calculator.
 */
export interface IAlphaScorer {
  calculate(coin: CoinData): { score: number; breakdown: ScoreBreakdown };
}

/**
 * Contract for the full multi-stage scanner pipeline.
 */
export interface IScannerEngine {
  scan(): Promise<CoinData[]>;
}
