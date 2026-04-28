import { CoinData } from '../../types';
import { fetchWithBackoff } from '../../utils/fetcher';
import { logger } from '../../utils/logger';
import {
  NarrativeAnalysis,
  DevActivityMetrics,
  CatalystEvent,
  SectorRotation,
} from '../types';

const GITHUB_API = 'https://api.github.com';

const SECTOR_GITHUB_MAP: Record<string, string[]> = {
  BTC: ['bitcoin/bitcoin'],
  ETH: ['ethereum/go-ethereum'],
  SOL: ['solana-labs/solana'],
  AVAX: ['ava-labs/avalanchego'],
  DOT: ['nickvdz/polkadot-sdk'],
  LINK: ['smartcontractkit/chainlink'],
  UNI: ['Uniswap/v3-core'],
  AAVE: ['aave/aave-v3-core'],
  MKR: ['makerdao/dss'],
  SNX: ['Synthetixio/synthetix'],
  MATIC: ['maticnetwork/bor'],
  ARB: ['OffchainLabs/nitro'],
  OP: ['ethereum-optimism/optimism'],
};

/**
 * Module 6: Narrative / Catalyst Engine
 *
 * - GitHub Developer Activity Tracking
 * - Partnership & Event Detection
 * - Sector Rotation Analysis
 */
export class NarrativeEngine {
  private githubToken: string | null;

  constructor() {
    this.githubToken = process.env.GITHUB_TOKEN || null;
  }

  async analyze(coin: CoinData): Promise<NarrativeAnalysis> {
    const [devActivity, catalysts, sectorFlow] = await Promise.all([
      this.analyzeDevActivity(coin),
      this.detectCatalysts(coin),
      this.analyzeSectorRotation(coin),
    ]);

    const narrativeScore = this.calculateNarrativeScore(
      devActivity,
      catalysts,
      sectorFlow,
    );

    return {
      symbol: coin.symbol,
      devActivity,
      catalysts,
      sectorFlow,
      narrativeScore,
    };
  }

  /**
   * GitHub Developer Activity — fetch commit stats for known repos.
   */
  private async analyzeDevActivity(
    coin: CoinData,
  ): Promise<DevActivityMetrics> {
    const repos = SECTOR_GITHUB_MAP[coin.symbol];

    if (!repos || repos.length === 0) {
      return this.estimateDevActivity(coin);
    }

    const repo = repos[0];
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    };
    if (this.githubToken) {
      headers['Authorization'] = `token ${this.githubToken}`;
    }

    try {
      const [weeklyData, repoInfo] = await Promise.all([
        fetchWithBackoff<Array<{ total: number; week: number }>>(
          `${GITHUB_API}/repos/${repo}/stats/commit_activity`,
          { headers, label: `github/commits/${repo}` },
        ),
        fetchWithBackoff<{
          subscribers_count: number;
          pushed_at: string;
        }>(
          `${GITHUB_API}/repos/${repo}`,
          { headers, label: `github/repo/${repo}` },
        ),
      ]);

      if (Array.isArray(weeklyData) && weeklyData.length > 0) {
        const recentWeeks = weeklyData.slice(-4);
        const weeklyCommits =
          recentWeeks.length > 0 ? recentWeeks[recentWeeks.length - 1].total : 0;
        const monthlyCommits = recentWeeks.reduce((s, w) => s + w.total, 0);

        const lastPushDate = new Date(repoInfo.pushed_at);
        const daysSinceLastCommit = Math.floor(
          (Date.now() - lastPushDate.getTime()) / (24 * 60 * 60 * 1000),
        );

        return {
          weeklyCommits,
          monthlyCommits,
          contributors: repoInfo.subscribers_count || 0,
          lastCommitDaysAgo: daysSinceLastCommit,
          isActive: daysSinceLastCommit < 7 && weeklyCommits > 5,
        };
      }
    } catch (err) {
      const error = err as Error;
      logger.debug(
        { symbol: coin.symbol, repo, error: error.message },
        'GitHub activity fetch failed',
      );
    }

    return this.estimateDevActivity(coin);
  }

  /**
   * Estimate dev activity from available market data when GitHub
   * data is not available.
   */
  private estimateDevActivity(coin: CoinData): DevActivityMetrics {
    const hasOnChain = (coin.dexTxns24h || 0) > 0;
    const hasLiquidity = (coin.dexLiquidity || 0) > 100000;
    const isActive = hasOnChain && hasLiquidity;

    return {
      weeklyCommits: 0,
      monthlyCommits: 0,
      contributors: 0,
      lastCommitDaysAgo: -1,
      isActive,
    };
  }

  /**
   * Catalyst Detection — identify upcoming events that could
   * impact price based on available signals.
   */
  private async detectCatalysts(
    coin: CoinData,
  ): Promise<CatalystEvent[]> {
    const catalysts: CatalystEvent[] = [];

    if (coin.priceChange7d > 30 && coin.volume24h > 1e6) {
      catalysts.push({
        type: 'LISTING',
        description: `${coin.symbol} showing listing-grade momentum (+${coin.priceChange7d.toFixed(1)}% 7d)`,
        date: null,
        impactEstimate: 'HIGH',
        source: 'momentum_analysis',
      });
    }

    if (
      coin.dexVolume24h !== null &&
      coin.volume24h > 0 &&
      coin.dexVolume24h / coin.volume24h > 0.5
    ) {
      catalysts.push({
        type: 'PARTNERSHIP',
        description: `${coin.symbol} high DEX/CEX ratio suggests growing DeFi integration`,
        date: null,
        impactEstimate: 'MEDIUM',
        source: 'volume_analysis',
      });
    }

    if (
      coin.maxSupply &&
      coin.circulatingSupply > 0 &&
      coin.circulatingSupply / coin.maxSupply < 0.5
    ) {
      catalysts.push({
        type: 'UNLOCK',
        description: `${coin.symbol} has ${((1 - coin.circulatingSupply / coin.maxSupply) * 100).toFixed(0)}% supply still locked`,
        date: null,
        impactEstimate: coin.circulatingSupply / coin.maxSupply < 0.3 ? 'HIGH' : 'MEDIUM',
        source: 'supply_analysis',
      });
    }

    const categories = coin.categories.map((c) => c.toLowerCase());
    const hotSectors = ['ai', 'rwa', 'depin', 'layer 2', 'gaming'];
    const matchedSectors = hotSectors.filter((s) =>
      categories.some((c) => c.includes(s)),
    );

    if (matchedSectors.length > 0) {
      catalysts.push({
        type: 'GOVERNANCE',
        description: `${coin.symbol} aligned with hot narratives: ${matchedSectors.join(', ')}`,
        date: null,
        impactEstimate: 'MEDIUM',
        source: 'narrative_analysis',
      });
    }

    return catalysts;
  }

  /**
   * Sector Rotation Analysis — estimates capital flow direction
   * for the coin's primary sector using volume trends.
   */
  private async analyzeSectorRotation(
    coin: CoinData,
  ): Promise<SectorRotation> {
    const sector = coin.sector || 'Other';
    const volume = coin.volume24h || 0;
    const priceChange = coin.priceChange7d || 0;

    const inflowEstimate = priceChange > 0 ? volume * 0.7 : volume * 0.3;
    const outflowEstimate = priceChange > 0 ? volume * 0.3 : volume * 0.7;

    const netFlow = inflowEstimate - outflowEstimate;

    let trendDirection: 'INFLOW' | 'OUTFLOW' | 'NEUTRAL';
    if (netFlow > volume * 0.1) trendDirection = 'INFLOW';
    else if (netFlow < -volume * 0.1) trendDirection = 'OUTFLOW';
    else trendDirection = 'NEUTRAL';

    let sectorRank: number;
    if (trendDirection === 'INFLOW' && priceChange > 10) sectorRank = 1;
    else if (trendDirection === 'INFLOW') sectorRank = 2;
    else if (trendDirection === 'NEUTRAL') sectorRank = 3;
    else sectorRank = 4;

    return {
      sector,
      inflowUsd7d: Math.round(inflowEstimate * 7),
      outflowUsd7d: Math.round(outflowEstimate * 7),
      netFlow: Math.round(netFlow * 7),
      trendDirection,
      sectorRank,
    };
  }

  /**
   * Calculate a composite narrative score (0-100).
   */
  private calculateNarrativeScore(
    devActivity: DevActivityMetrics,
    catalysts: CatalystEvent[],
    sectorFlow: SectorRotation,
  ): number {
    let score = 0;

    if (devActivity.isActive) score += 25;
    else if (devActivity.weeklyCommits > 0) score += 15;
    else score += 5;

    const highImpact = catalysts.filter((c) => c.impactEstimate === 'HIGH').length;
    const medImpact = catalysts.filter((c) => c.impactEstimate === 'MEDIUM').length;
    score += Math.min(35, highImpact * 15 + medImpact * 8);

    if (sectorFlow.trendDirection === 'INFLOW') {
      score += sectorFlow.sectorRank <= 2 ? 25 : 15;
    } else if (sectorFlow.trendDirection === 'NEUTRAL') {
      score += 10;
    }

    const catalystBonus = Math.min(15, catalysts.length * 5);
    score += catalystBonus;

    return Math.min(100, score);
  }

  async analyzeBatch(
    coins: CoinData[],
  ): Promise<Map<string, NarrativeAnalysis>> {
    const results = new Map<string, NarrativeAnalysis>();

    for (const coin of coins) {
      try {
        const analysis = await this.analyze(coin);
        results.set(coin.symbol, analysis);
      } catch (err) {
        const error = err as Error;
        logger.warn(
          { symbol: coin.symbol, error: error.message },
          'Narrative analysis failed',
        );
      }
    }

    logger.info(
      {
        analyzed: results.size,
        withCatalysts: [...results.values()].filter(
          (r) => r.catalysts.length > 0,
        ).length,
        activeDevs: [...results.values()].filter(
          (r) => r.devActivity.isActive,
        ).length,
      },
      'Narrative/Catalyst analysis complete',
    );

    return results;
  }
}
