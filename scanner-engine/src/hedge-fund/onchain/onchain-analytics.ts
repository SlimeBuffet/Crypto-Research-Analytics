import { CoinData } from '../../types';
import { logger } from '../../utils/logger';
import {
  OnChainAnalytics,
  WalletConcentration,
  SmartMoneyFlow,
  UnlockScheduleInfo,
  ProtocolRevenue,
} from '../types';

/**
 * Module 1: On-Chain Analytics Deep Dive
 *
 * - Wallet Concentration (Gini Coefficient)
 * - Smart Money Wallet Tracking
 * - Token Unlock Schedule Analysis
 * - Protocol Revenue Tracking
 */
export class OnChainAnalyticsEngine {
  async analyze(coin: CoinData): Promise<OnChainAnalytics> {
    const [walletConcentration, smartMoneyFlow, unlockSchedule, protocolRevenue] =
      await Promise.all([
        this.analyzeWalletConcentration(coin),
        this.analyzeSmartMoneyFlow(coin),
        this.analyzeUnlockSchedule(coin),
        this.analyzeProtocolRevenue(coin),
      ]);

    return {
      symbol: coin.symbol,
      walletConcentration,
      smartMoneyFlow,
      unlockSchedule,
      protocolRevenue,
    };
  }

  /**
   * Wallet Concentration Analysis — Gini Coefficient proxy.
   * Uses circulating supply vs total supply ratios and DEX data
   * to estimate concentration risk.
   */
  private async analyzeWalletConcentration(
    coin: CoinData,
  ): Promise<WalletConcentration> {
    const circ = coin.circulatingSupply || 0;
    const total = coin.totalSupply || 1;
    const maxSup = coin.maxSupply;

    const circRatio = circ / total;

    let giniEstimate = 0.6;
    if (coin.dexTxns24h !== null && coin.dexTxns24h > 0) {
      const avgTxSize =
        (coin.dexVolume24h || 0) / coin.dexTxns24h;

      if (avgTxSize > 100000) giniEstimate = 0.85;
      else if (avgTxSize > 50000) giniEstimate = 0.75;
      else if (avgTxSize > 10000) giniEstimate = 0.65;
      else if (avgTxSize > 1000) giniEstimate = 0.5;
      else giniEstimate = 0.4;
    }

    if (maxSup && circRatio < 0.3) {
      giniEstimate = Math.min(0.95, giniEstimate + 0.15);
    }

    const top10Estimate = giniEstimate * 60;
    const top50Estimate = giniEstimate * 85;
    const isConcentrated = giniEstimate > 0.7 || top10Estimate > 50;

    return {
      giniCoefficient: Math.round(giniEstimate * 1000) / 1000,
      top10HoldersPct: Math.round(top10Estimate * 10) / 10,
      top50HoldersPct: Math.round(top50Estimate * 10) / 10,
      isConcentrated,
    };
  }

  /**
   * Smart Money Flow — tracks whale activity via DEX volume patterns.
   */
  private async analyzeSmartMoneyFlow(
    coin: CoinData,
  ): Promise<SmartMoneyFlow> {
    const dexVol = coin.dexVolume24h || 0;
    const cexVol = coin.volume24h || 0;
    const txns = coin.dexTxns24h || 0;

    const netFlowUsd24h = dexVol - cexVol * 0.1;

    const whaleThreshold = 50000;
    const avgTxSize = txns > 0 ? dexVol / txns : 0;
    const estimatedWhaleTxns = txns > 0
      ? Math.floor(txns * Math.min(1, whaleThreshold / (avgTxSize * 10 || 1)))
      : 0;

    const smartMoneyBuying =
      netFlowUsd24h > 0 &&
      coin.priceChange24h > 0 &&
      avgTxSize > 10000;

    return {
      netFlowUsd24h: Math.round(netFlowUsd24h),
      smartMoneyBuying,
      whaleTransactions: estimatedWhaleTxns,
      avgWhaleSize: Math.round(avgTxSize),
    };
  }

  /**
   * Token Unlock Schedule Analysis.
   * Estimates unlock risk from supply metrics.
   */
  private async analyzeUnlockSchedule(
    coin: CoinData,
  ): Promise<UnlockScheduleInfo> {
    const circ = coin.circulatingSupply || 0;
    const total = coin.totalSupply || 0;
    const maxSup = coin.maxSupply;

    if (total === 0) {
      return {
        nextUnlockDate: null,
        nextUnlockPct: 0,
        totalLockedPct: 0,
        unlockRisk: 'UNKNOWN',
      };
    }

    const lockedPct = ((total - circ) / total) * 100;
    const pendingSupplyPct = maxSup
      ? ((maxSup - circ) / maxSup) * 100
      : lockedPct;

    let unlockRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
    if (pendingSupplyPct > 50) unlockRisk = 'HIGH';
    else if (pendingSupplyPct > 25) unlockRisk = 'MEDIUM';
    else unlockRisk = 'LOW';

    const estimatedNextUnlockPct = Math.min(10, pendingSupplyPct * 0.1);

    return {
      nextUnlockDate: null,
      nextUnlockPct: Math.round(estimatedNextUnlockPct * 100) / 100,
      totalLockedPct: Math.round(lockedPct * 100) / 100,
      unlockRisk,
    };
  }

  /**
   * Protocol Revenue — estimates fee generation relative to market cap.
   */
  private async analyzeProtocolRevenue(
    coin: CoinData,
  ): Promise<ProtocolRevenue> {
    const dexVol = coin.dexVolume24h || 0;
    const estimatedFeeRate = 0.003;
    const dailyRevenueUsd = dexVol * estimatedFeeRate;
    const weeklyRevenueUsd = dailyRevenueUsd * 7;

    const mc = coin.marketCap || 1;
    const revenueMcRatio = (dailyRevenueUsd * 365) / mc;

    return {
      dailyRevenueUsd: Math.round(dailyRevenueUsd * 100) / 100,
      weeklyRevenueUsd: Math.round(weeklyRevenueUsd * 100) / 100,
      revenueMcRatio: Math.round(revenueMcRatio * 10000) / 10000,
      isProfitable: revenueMcRatio > 0.05,
    };
  }

  async analyzeBatch(
    coins: CoinData[],
  ): Promise<Map<string, OnChainAnalytics>> {
    const results = new Map<string, OnChainAnalytics>();

    for (const coin of coins) {
      try {
        const analysis = await this.analyze(coin);
        results.set(coin.symbol, analysis);
      } catch (err) {
        const error = err as Error;
        logger.warn(
          { symbol: coin.symbol, error: error.message },
          'On-chain analytics failed',
        );
      }
    }

    logger.info(
      { analyzed: results.size, total: coins.length },
      'On-Chain Analytics complete',
    );

    return results;
  }
}
