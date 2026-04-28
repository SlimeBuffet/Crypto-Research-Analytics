import { CoinData } from '../types';
import {
  RiskAnalysis,
  SecurityAuditResult,
} from '../types/hedge-fund';
import { fetchWithBackoff } from '../utils/fetcher';
import { TtlCache } from '../utils/cache';

const BINANCE_URL = process.env.BINANCE_BASE_URL || 'https://data-api.binance.vision/api/v3';

/**
 * Pillar B: Quantitative Risk Engine — "The Shield"
 *
 * - Correlation Matrix: prevent sector over-exposure (threshold < 0.8)
 * - Value at Risk (VaR): based on 24h historical volatility
 * - Automated Security Audit: mint(), honeypot, ownership checks
 */
export class RiskEngine {
  private readonly correlationThreshold: number;
  private readonly varConfidence: number;

  constructor(
    private cache: TtlCache,
    correlationThreshold = 0.8,
    varConfidence = 0.95,
  ) {
    this.correlationThreshold = correlationThreshold;
    this.varConfidence = varConfidence;
  }

  async analyze(
    coin: CoinData,
    portfolio: CoinData[],
  ): Promise<RiskAnalysis> {
    const correlationRisk = await this.checkCorrelation(coin, portfolio);
    const valueAtRisk = await this.calculateVaR(coin);
    const securityAudit = this.performSecurityAudit(coin);

    let approved = true;
    let rejectReason: string | null = null;

    if (correlationRisk > this.correlationThreshold) {
      approved = false;
      rejectReason = `High correlation (${correlationRisk.toFixed(2)}) with existing portfolio — sector over-exposure`;
    } else if (!securityAudit.ownershipRenounced && securityAudit.hasMintFunction) {
      approved = false;
      rejectReason = 'Security risk: mint function detected with active ownership';
    } else if (securityAudit.isHoneypot) {
      approved = false;
      rejectReason = 'Honeypot detected — cannot sell';
    }

    const totalRiskScore = this.computeRiskScore(
      correlationRisk,
      valueAtRisk,
      securityAudit,
    );

    return {
      correlationRisk,
      valueAtRisk,
      securityAudit,
      totalRiskScore,
      approved,
      rejectReason,
    };
  }

  /**
   * Correlation Matrix — check if new coin is too correlated
   * with existing portfolio holdings (limit < 0.8).
   */
  private async checkCorrelation(
    coin: CoinData,
    portfolio: CoinData[],
  ): Promise<number> {
    if (portfolio.length === 0) return 0;

    const coinReturns = await this.fetchDailyReturns(coin.symbol);
    if (coinReturns.length === 0) return 0;

    let maxCorrelation = 0;
    for (const holding of portfolio) {
      const holdingReturns = await this.fetchDailyReturns(holding.symbol);
      if (holdingReturns.length === 0) continue;

      const corr = this.pearsonCorrelation(coinReturns, holdingReturns);
      maxCorrelation = Math.max(maxCorrelation, Math.abs(corr));
    }

    return maxCorrelation;
  }

  /** Calculate historical VaR using parametric method */
  private async calculateVaR(coin: CoinData): Promise<number> {
    const returns = await this.fetchDailyReturns(coin.symbol);
    if (returns.length < 5) return 0.1;

    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance =
      returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);

    // Z-score for confidence level (1.645 for 95%, 2.326 for 99%)
    const zScore = this.varConfidence >= 0.99 ? 2.326 : 1.645;
    const var24h = Math.abs(mean - zScore * stdDev);

    return Math.min(var24h, 1);
  }

  /**
   * Automated Security Audit.
   * Checks for common scam indicators using on-chain data proxies.
   */
  private performSecurityAudit(coin: CoinData): SecurityAuditResult {
    const flags: string[] = [];
    let score = 100;

    // Check: mint function proxy — if totalSupply >> circulatingSupply
    const hasMintFunction =
      coin.totalSupply > 0 &&
      coin.circulatingSupply > 0 &&
      coin.totalSupply / coin.circulatingSupply > 5;
    if (hasMintFunction) {
      flags.push('Potential mint function: totalSupply >> circulatingSupply');
      score -= 30;
    }

    // Check: honeypot proxy — very low DEX sell transactions
    let isHoneypot = false;
    if (coin.dexTxns24h !== null && coin.dexTxns24h < 5 && coin.volume24h > 100_000) {
      isHoneypot = true;
      flags.push('Possible honeypot: high volume but near-zero DEX transactions');
      score -= 50;
    }

    // Check: ownership — proxy via FDV/MC ratio anomaly
    const ownershipRenounced = coin.fdvMcRatio > 0 && coin.fdvMcRatio < 3;
    if (!ownershipRenounced) {
      flags.push('Ownership concern: extreme FDV/MC ratio suggests concentrated control');
      score -= 20;
    }

    // Check: extreme price volatility as rug-pull indicator
    if (Math.abs(coin.priceChange24h) > 50) {
      flags.push(`Extreme 24h volatility: ${coin.priceChange24h.toFixed(1)}%`);
      score -= 15;
    }

    // Check: liquidity depth
    if (coin.dexLiquidity !== null && coin.dexLiquidity < 50_000) {
      flags.push('Dangerously low DEX liquidity');
      score -= 20;
    }

    return {
      hasMintFunction,
      isHoneypot,
      ownershipRenounced,
      score: Math.max(0, score),
      flags,
    };
  }

  /** Pearson correlation between two return series */
  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 3) return 0;

    const xSlice = x.slice(-n);
    const ySlice = y.slice(-n);

    const meanX = xSlice.reduce((s, v) => s + v, 0) / n;
    const meanY = ySlice.reduce((s, v) => s + v, 0) / n;

    let cov = 0, varX = 0, varY = 0;
    for (let i = 0; i < n; i++) {
      const dx = xSlice[i] - meanX;
      const dy = ySlice[i] - meanY;
      cov += dx * dy;
      varX += dx * dx;
      varY += dy * dy;
    }

    const denom = Math.sqrt(varX * varY);
    return denom > 0 ? cov / denom : 0;
  }

  /** Fetch daily close returns for correlation/VaR */
  private async fetchDailyReturns(symbol: string): Promise<number[]> {
    const cacheKey = `returns:${symbol}`;
    const cached = this.cache.get<number[]>(cacheKey);
    if (cached) return cached;

    try {
      const rawData = await fetchWithBackoff<unknown[][]>(
        `${BINANCE_URL}/klines?symbol=${symbol}USDT&interval=1d&limit=30`,
        { label: `risk/returns/${symbol}` },
      );

      const closes = rawData.map((k) => parseFloat(k[4] as string));
      const returns: number[] = [];
      for (let i = 1; i < closes.length; i++) {
        if (closes[i - 1] > 0) {
          returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
        }
      }

      this.cache.set(cacheKey, returns, 3600_000);
      return returns;
    } catch {
      return [];
    }
  }

  /** Compute composite risk score (0-100, higher = riskier) */
  private computeRiskScore(
    correlation: number,
    var24h: number,
    audit: SecurityAuditResult,
  ): number {
    const corrScore = correlation * 30;
    const varScore = Math.min(var24h * 100, 30);
    const auditScore = (100 - audit.score) * 0.4;
    return Math.min(100, corrScore + varScore + auditScore);
  }
}
