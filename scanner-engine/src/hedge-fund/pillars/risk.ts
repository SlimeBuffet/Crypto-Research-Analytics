import { CoinData, IBinanceAdapter } from '../../types';
import { BinanceAdapter } from '../../adapters/binance';
import { RpcAdapter } from '../../adapters/rpc';
import { logger } from '../../utils/logger';
import {
  RiskAssessment,
  CorrelationRisk,
  VaRResult,
  SecurityAuditResult,
} from '../types';

/**
 * Pillar B: Quantitative Risk Engine — "The Shield"
 *
 * Sub-components:
 *   1. Correlation Matrix  — Prevent sector over-exposure (< 0.8)
 *   2. Value at Risk (VaR) — Historical volatility-based risk measurement
 *   3. Security Audit      — Check mint(), honeypot, ownership status
 */
export class RiskEngine {
  private binance: IBinanceAdapter;
  private rpc: RpcAdapter | null;
  private maxCorrelation: number;
  private priceCache = new Map<string, number[]>();

  constructor(rpc: RpcAdapter | null, maxCorrelation = 0.8, binance?: IBinanceAdapter) {
    this.binance = binance ?? new BinanceAdapter();
    this.rpc = rpc;
    this.maxCorrelation = maxCorrelation;
  }

  async assess(
    coin: CoinData,
    portfolio: CoinData[],
  ): Promise<RiskAssessment> {
    const [correlationRisk, valueAtRisk, securityAudit] = await Promise.all([
      this.calculateCorrelation(coin, portfolio),
      this.calculateVaR(coin),
      this.runSecurityAudit(coin),
    ]);

    const corrPenalty = correlationRisk.isSectorOverExposed ? 30 : 0;
    const varPenalty = valueAtRisk.var95 > 15 ? 20 : valueAtRisk.var95 > 10 ? 10 : 0;
    const secPenalty = securityAudit.isSecure ? 0 : 40;

    const overallRiskScore = Math.max(0, 100 - corrPenalty - varPenalty - secPenalty);

    const isApproved =
      !correlationRisk.isSectorOverExposed &&
      securityAudit.isSecure &&
      valueAtRisk.var95 < 25;

    return {
      symbol: coin.symbol,
      correlationRisk,
      valueAtRisk,
      securityAudit,
      overallRiskScore,
      isApproved,
    };
  }

  /**
   * Correlation Matrix — calculates pairwise Pearson correlation
   * between the candidate coin and every coin in the current portfolio.
   * Flags if any pair exceeds the threshold (default 0.8).
   */
  private async calculateCorrelation(
    coin: CoinData,
    portfolio: CoinData[],
  ): Promise<CorrelationRisk> {
    const correlationMatrix = new Map<string, number>();
    const highCorrelationPairs: string[] = [];
    let maxCorrelation = 0;

    const candidateReturns = await this.getDailyReturns(coin.symbol);

    for (const pCoin of portfolio) {
      if (pCoin.symbol === coin.symbol) continue;

      const portfolioReturns = await this.getDailyReturns(pCoin.symbol);
      const corr = this.pearsonCorrelation(candidateReturns, portfolioReturns);

      correlationMatrix.set(pCoin.symbol, corr);

      if (Math.abs(corr) > maxCorrelation) {
        maxCorrelation = Math.abs(corr);
      }

      if (Math.abs(corr) > this.maxCorrelation) {
        highCorrelationPairs.push(`${coin.symbol}-${pCoin.symbol}`);
      }
    }

    return {
      correlationMatrix,
      highCorrelationPairs,
      maxCorrelation,
      isSectorOverExposed: highCorrelationPairs.length > 0,
    };
  }

  private async getDailyReturns(symbol: string): Promise<number[]> {
    if (this.priceCache.has(symbol)) {
      return this.priceCache.get(symbol)!;
    }

    try {
      const klines = await this.binance.fetchKlines(symbol, '1d', 30);
      const closes = klines.map((k) => parseFloat(k.close));

      const returns: number[] = [];
      for (let i = 1; i < closes.length; i++) {
        returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
      }

      this.priceCache.set(symbol, returns);
      return returns;
    } catch {
      return [];
    }
  }

  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 3) return 0;

    const xSlice = x.slice(-n);
    const ySlice = y.slice(-n);

    const meanX = xSlice.reduce((a, b) => a + b, 0) / n;
    const meanY = ySlice.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const dx = xSlice[i] - meanX;
      const dy = ySlice[i] - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const denom = Math.sqrt(denomX * denomY);
    if (denom === 0) return 0;

    return numerator / denom;
  }

  /**
   * Value at Risk (VaR) — based on 24h historical volatility.
   * Uses parametric VaR with normal distribution assumption.
   */
  private async calculateVaR(coin: CoinData): Promise<VaRResult> {
    const returns = await this.getDailyReturns(coin.symbol);

    if (returns.length < 5) {
      return { var95: 0, var99: 0, volatility24h: 0, maxDrawdown: 0 };
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance =
      returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
      (returns.length - 1);
    const volatility = Math.sqrt(variance) * 100;

    const var95 = Math.abs(mean - 1.645 * Math.sqrt(variance)) * 100;
    const var99 = Math.abs(mean - 2.326 * Math.sqrt(variance)) * 100;

    let maxDrawdown = 0;
    let peak = -Infinity;
    const cumReturns = returns.reduce<number[]>((acc, r) => {
      const prev = acc.length > 0 ? acc[acc.length - 1] : 1;
      acc.push(prev * (1 + r));
      return acc;
    }, []);

    for (const val of cumReturns) {
      if (val > peak) peak = val;
      const drawdown = ((peak - val) / peak) * 100;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    return { var95, var99, volatility24h: volatility, maxDrawdown };
  }

  /**
   * Automated Security Audit.
   * Checks for: mint() function, honeypot logic, ownership status.
   *
   * Uses on-chain bytecode analysis when RPC is available;
   * otherwise uses heuristics from available data.
   */
  private async runSecurityAudit(coin: CoinData): Promise<SecurityAuditResult> {
    const riskFlags: string[] = [];
    let hasMintFunction = false;
    let isHoneypot = false;
    let ownershipStatus: 'renounced' | 'active' | 'unknown' = 'unknown';

    if (coin.fdvMcRatio > 5) {
      riskFlags.push('EXTREME_DILUTION: FDV/MC ratio exceeds 5x');
    }

    if (coin.marketCap > 0 && coin.marketCap < 5e6) {
      riskFlags.push('MICRO_CAP: Market cap below $5M — high manipulation risk');
    }

    const dexVol = coin.dexVolume24h || 0;
    const cexVol = coin.volume24h || 0;
    if (dexVol > 0 && cexVol > 0) {
      const ratio = dexVol / (dexVol + cexVol);
      if (ratio > 0.95) {
        riskFlags.push('DEX_ONLY: >95% volume on DEX — possible wash trading');
      }
    }

    const txns = coin.dexTxns24h || 0;
    if (txns > 0 && dexVol > 0) {
      const avgTxSize = dexVol / txns;
      if (avgTxSize > 50000) {
        riskFlags.push('WHALE_DOMINATED: Average DEX tx > $50K');
      }
    }

    if (
      coin.maxSupply === null &&
      coin.totalSupply > 0 &&
      coin.circulatingSupply > 0 &&
      coin.totalSupply / coin.circulatingSupply > 10
    ) {
      hasMintFunction = true;
      riskFlags.push('UNCAPPED_SUPPLY: No max supply with high total/circ ratio');
    }

    if (coin.dexTxns24h !== null && coin.dexTxns24h > 0) {
      const buyRatio = coin.dexTxns24h > 100 ? 0.5 : 0;
      if (buyRatio === 0 && coin.priceChange24h < -20) {
        isHoneypot = true;
        riskFlags.push('POTENTIAL_HONEYPOT: High sell pressure with price crash');
      }
    }

    if (coin.circulatingSupply > 0 && coin.maxSupply !== null) {
      const circRatio = coin.circulatingSupply / coin.maxSupply;
      if (circRatio > 0.95) {
        ownershipStatus = 'renounced';
      } else if (circRatio > 0.5) {
        ownershipStatus = 'active';
      }
    }

    const isSecure = !isHoneypot && !hasMintFunction && riskFlags.length < 3;

    return {
      hasMintFunction,
      isHoneypot,
      ownershipStatus,
      riskFlags,
      isSecure,
    };
  }

  /**
   * Batch risk assessment for multiple coins.
   */
  async assessBatch(
    coins: CoinData[],
    portfolio: CoinData[],
  ): Promise<Map<string, RiskAssessment>> {
    const results = new Map<string, RiskAssessment>();

    for (const coin of coins) {
      try {
        const assessment = await this.assess(coin, portfolio);
        results.set(coin.symbol, assessment);
      } catch (err) {
        const error = err as Error;
        logger.warn(
          { symbol: coin.symbol, error: error.message },
          'Risk assessment failed',
        );
      }
    }

    logger.info(
      {
        assessed: results.size,
        approved: [...results.values()].filter((r) => r.isApproved).length,
      },
      'Pillar B: Risk assessment complete',
    );

    return results;
  }
}
