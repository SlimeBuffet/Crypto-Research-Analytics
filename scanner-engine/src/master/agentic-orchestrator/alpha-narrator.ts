import { CoinData } from '../../types';
import {
  AlphaReport,
  ReasoningChain,
  SmcAnalysis,
  ForensicAuditResult,
  NarrativeMapResult,
  SmcConvergenceResult,
  ManipulationGuardResult,
  DynamicScoreResult,
  IAlphaHunter,
} from '../types';

/**
 * Layer 4: The Agentic Orchestrator — Alpha Narrator
 *
 * Generates human-readable reasoning for why a coin is (or isn't) worth investing in.
 * Acts as the "brain" that synthesizes all analytical layers into a coherent narrative.
 *
 * Output is not just "25/25" but:
 *   "This coin is valid because there's a Bullish OB on H1,
 *    liquidity is stable, and the DePIN narrative is trending on X."
 */
export class AlphaNarrator implements IAlphaHunter {
  readonly id = 'master-alpha-narrator';

  /**
   * Generate a complete Alpha Report with chain-of-thought reasoning.
   */
  async analyze(ticker: string): Promise<AlphaReport> {
    return this.generateReport(ticker, null, null, null, null, null, null);
  }

  /**
   * Generate a full Alpha Report from all available analysis data.
   */
  async generateReport(
    symbol: string,
    coin: CoinData | null,
    smcAnalysis: SmcAnalysis | null,
    forensicAudit: ForensicAuditResult | null,
    narrativeMap: NarrativeMapResult | null,
    convergence: SmcConvergenceResult | null,
    manipulationGuard: ManipulationGuardResult | null,
    dynamicScore?: DynamicScoreResult,
  ): Promise<AlphaReport> {
    const reasoning = this.buildReasoningChain(
      symbol,
      coin,
      smcAnalysis,
      forensicAudit,
      narrativeMap,
      convergence,
      manipulationGuard,
    );

    const catalysts = this.identifyCatalysts(
      coin,
      smcAnalysis,
      narrativeMap,
      convergence,
    );

    const risks = this.identifyRisks(
      coin,
      forensicAudit,
      manipulationGuard,
    );

    const verdict = this.determineVerdict(
      coin,
      smcAnalysis,
      forensicAudit,
      convergence,
      manipulationGuard,
      dynamicScore,
    );

    const confidence = this.calculateConfidence(
      coin,
      smcAnalysis,
      forensicAudit,
      convergence,
    );

    const narrative = this.composeNarrative(
      symbol,
      verdict,
      reasoning,
      catalysts,
      risks,
    );

    return {
      symbol,
      verdict,
      confidence,
      narrative,
      reasoning,
      catalysts,
      risks,
      timestamp: Date.now(),
    };
  }

  /**
   * Build chain-of-thought reasoning from all analysis layers.
   */
  private buildReasoningChain(
    symbol: string,
    coin: CoinData | null,
    smc: SmcAnalysis | null,
    forensic: ForensicAuditResult | null,
    narrative: NarrativeMapResult | null,
    convergence: SmcConvergenceResult | null,
    manipulation: ManipulationGuardResult | null,
  ): ReasoningChain {
    return {
      marketContext: this.buildMarketContext(coin),
      technicalAnalysis: this.buildTechnicalAnalysis(smc, convergence),
      fundamentalAnalysis: this.buildFundamentalAnalysis(coin),
      securityAssessment: this.buildSecurityAssessment(forensic, manipulation),
      narrativeFit: this.buildNarrativeFit(narrative),
      finalConclusion: this.buildConclusion(symbol, coin, smc, forensic),
    };
  }

  private buildMarketContext(coin: CoinData | null): string {
    if (!coin) return 'Insufficient market data for context analysis.';

    const parts: string[] = [];

    const mcLabel = coin.marketCap >= 1e9
      ? 'large-cap'
      : coin.marketCap >= 100e6
        ? 'mid-cap'
        : coin.marketCap >= 10e6
          ? 'small-cap'
          : 'micro-cap';

    parts.push(
      `${coin.symbol} is a ${mcLabel} asset trading at $${coin.price.toFixed(4)} ` +
      `with a market cap of $${(coin.marketCap / 1e6).toFixed(1)}M.`,
    );

    if (coin.volume24h > 0) {
      const volumeRatio = coin.volume24h / (coin.marketCap || 1);
      parts.push(
        `24h volume is $${(coin.volume24h / 1e6).toFixed(1)}M ` +
        `(${(volumeRatio * 100).toFixed(1)}% of market cap).`,
      );
    }

    if (coin.fdvMcRatio > 2) {
      parts.push(
        `Warning: FDV/MC ratio of ${coin.fdvMcRatio.toFixed(1)}x indicates significant dilution risk.`,
      );
    }

    return parts.join(' ');
  }

  private buildTechnicalAnalysis(
    smc: SmcAnalysis | null,
    convergence: SmcConvergenceResult | null,
  ): string {
    if (!smc) return 'No SMC data available for technical analysis.';

    const parts: string[] = [];

    parts.push(`Market structure is ${smc.marketStructure.currentTrend}.`);

    if (smc.marketStructure.mssDetected) {
      parts.push(
        `Market Structure Shift detected: ${smc.marketStructure.mssType} ` +
        `at $${smc.marketStructure.mssPrice?.toFixed(4)}.`,
      );
    }

    const activeOBs = smc.orderBlocks.filter((ob) => !ob.isMitigated);
    if (activeOBs.length > 0) {
      const bullishOBs = activeOBs.filter((ob) => ob.type === 'BULLISH_OB');
      const bearishOBs = activeOBs.filter((ob) => ob.type === 'BEARISH_OB');

      if (bullishOBs.length > 0) {
        parts.push(
          `${bullishOBs.length} active Bullish Order Block(s) detected ` +
          `on ${bullishOBs[0].timeframe} at $${bullishOBs[0].midPrice.toFixed(4)}.`,
        );
      }
      if (bearishOBs.length > 0) {
        parts.push(
          `${bearishOBs.length} active Bearish OB(s) present — supply zone overhead.`,
        );
      }
    }

    const unfilledFVGs = smc.fairValueGaps.filter((fvg) => !fvg.isFilled);
    if (unfilledFVGs.length > 0) {
      parts.push(`${unfilledFVGs.length} unfilled Fair Value Gap(s) remain.`);
    }

    if (convergence && convergence.isUltraGem) {
      parts.push(
        'ULTRA GEM SIGNAL: Liquidity grab confirmed with institutional entry pattern.',
      );
    } else if (convergence && convergence.liquidityGrabs.length > 0) {
      parts.push(
        `${convergence.liquidityGrabs.length} liquidity grab(s) detected — smart money activity.`,
      );
    }

    return parts.join(' ');
  }

  private buildFundamentalAnalysis(coin: CoinData | null): string {
    if (!coin) return 'No fundamental data available.';

    const parts: string[] = [];

    if (coin.sector && coin.sector !== 'Other') {
      parts.push(`Sector: ${coin.sector}.`);
    }

    if (coin.categories.length > 0) {
      parts.push(`Categories: ${coin.categories.slice(0, 5).join(', ')}.`);
    }

    const breakdown = coin.scoreBreakdown;
    parts.push(
      `Alpha Score breakdown — Liquidity: ${breakdown.liquidity}/5, ` +
      `Tokenomics: ${breakdown.tokenomics}/5, ` +
      `Momentum: ${breakdown.momentum}/5.`,
    );

    if (coin.dexLiquidity && coin.dexLiquidity > 500_000) {
      parts.push('DEX liquidity is healthy.');
    } else if (coin.dexLiquidity && coin.dexLiquidity < 100_000) {
      parts.push('Warning: Low DEX liquidity — exit may be difficult.');
    }

    return parts.join(' ');
  }

  private buildSecurityAssessment(
    forensic: ForensicAuditResult | null,
    manipulation: ManipulationGuardResult | null,
  ): string {
    if (!forensic) return 'Security audit not available.';

    const parts: string[] = [];

    parts.push(`Security level: ${forensic.overallRiskLevel}.`);

    const cs = forensic.contractSecurity;
    if (cs.ownershipStatus === 'RENOUNCED') {
      parts.push('Contract ownership is renounced (positive).');
    } else if (cs.ownershipStatus === 'ACTIVE') {
      parts.push('Contract ownership is still active (risk factor).');
    }

    if (cs.isLiquidityLocked) {
      parts.push('Liquidity is locked.');
    } else {
      parts.push('Warning: Liquidity is NOT locked — rug-pull risk exists.');
    }

    if (cs.hasMintFunction) {
      parts.push('CRITICAL: Contract has mint() function — supply inflation risk.');
    }

    if (forensic.whaleAnalysis.isConcentrated) {
      parts.push(
        `Warning: High whale concentration — top 10 non-exchange wallets hold ` +
        `${forensic.whaleAnalysis.top10NonExchangePct.toFixed(1)}%.`,
      );
    }

    if (manipulation && manipulation.isManipulated) {
      parts.push(
        `MANIPULATION DETECTED: Wash trading probability ${(manipulation.washTradingProbability * 100).toFixed(0)}%.`,
      );
    }

    return parts.join(' ');
  }

  private buildNarrativeFit(narrative: NarrativeMapResult | null): string {
    if (!narrative || narrative.matchedNarratives.length === 0) {
      return 'No active narrative match found.';
    }

    const trending = narrative.matchedNarratives.filter((n) => n.isTrending);
    const topMatch = narrative.matchedNarratives[0];

    if (trending.length > 0) {
      return (
        `Active narrative fit: ${trending.map((n) => n.narrative).join(', ')} ` +
        `(trending). Narrative boost: +${narrative.trendingBoost.toFixed(1)}. ` +
        `Top match "${topMatch.narrative}" with ${(topMatch.relevanceScore * 100).toFixed(0)}% relevance.`
      );
    }

    return (
      `Narrative match: ${topMatch.narrative} ` +
      `(relevance ${(topMatch.relevanceScore * 100).toFixed(0)}%), but not currently trending.`
    );
  }

  private buildConclusion(
    symbol: string,
    coin: CoinData | null,
    smc: SmcAnalysis | null,
    forensic: ForensicAuditResult | null,
  ): string {
    const parts: string[] = [];

    if (smc && smc.bias === 'BULLISH' && smc.marketStructure.mssDetected) {
      parts.push(
        `${symbol} shows strong bullish SMC structure with confirmed MSS.`,
      );
    }

    if (forensic && forensic.isApproved) {
      parts.push('Security audit passed — contract is considered safe.');
    } else if (forensic && !forensic.isApproved) {
      parts.push('Security audit FAILED — recommend avoiding this asset.');
    }

    if (coin && coin.alphaScore >= 18) {
      parts.push(
        `Base Alpha Score of ${coin.alphaScore}/25 indicates strong fundamentals.`,
      );
    }

    if (parts.length === 0) {
      parts.push(`${symbol}: Insufficient data for a conclusive assessment.`);
    }

    return parts.join(' ');
  }

  /**
   * Identify bullish catalysts from all analysis layers.
   */
  private identifyCatalysts(
    coin: CoinData | null,
    smc: SmcAnalysis | null,
    narrative: NarrativeMapResult | null,
    convergence: SmcConvergenceResult | null,
  ): string[] {
    const catalysts: string[] = [];

    if (smc) {
      const bullishOBs = smc.orderBlocks.filter(
        (ob) => ob.type === 'BULLISH_OB' && !ob.isMitigated,
      );
      if (bullishOBs.length > 0) {
        catalysts.push(
          `Bullish Order Block on ${bullishOBs[0].timeframe} at $${bullishOBs[0].midPrice.toFixed(4)}`,
        );
      }

      if (smc.marketStructure.mssDetected && smc.marketStructure.mssType === 'BULLISH_MSS') {
        catalysts.push('Bullish Market Structure Shift confirmed');
      }
    }

    if (convergence && convergence.isUltraGem) {
      catalysts.push('Institutional liquidity grab pattern — Ultra Gem signal');
    }

    if (narrative) {
      const trending = narrative.matchedNarratives.filter((n) => n.isTrending);
      for (const n of trending.slice(0, 2)) {
        catalysts.push(`${n.narrative} narrative is trending`);
      }
    }

    if (coin) {
      if (coin.priceChange7d > 20) {
        catalysts.push(`Strong 7d momentum (+${coin.priceChange7d.toFixed(1)}%)`);
      }
      if (coin.dexLiquidity && coin.dexLiquidity > 1_000_000) {
        catalysts.push('Deep DEX liquidity provides solid exit routes');
      }
    }

    return catalysts;
  }

  /**
   * Identify risk factors from all analysis layers.
   */
  private identifyRisks(
    coin: CoinData | null,
    forensic: ForensicAuditResult | null,
    manipulation: ManipulationGuardResult | null,
  ): string[] {
    const risks: string[] = [];

    if (forensic) {
      if (forensic.contractSecurity.hasMintFunction) {
        risks.push('Contract has mint() function — inflation risk');
      }
      if (!forensic.contractSecurity.isLiquidityLocked) {
        risks.push('Liquidity is not locked — potential rug-pull');
      }
      if (forensic.whaleAnalysis.isConcentrated) {
        risks.push(
          `Top 10 non-exchange wallets hold ${forensic.whaleAnalysis.top10NonExchangePct.toFixed(0)}% of supply`,
        );
      }
    }

    if (manipulation && manipulation.isManipulated) {
      for (const flag of manipulation.manipulationFlags) {
        risks.push(`${flag.type}: ${flag.evidence}`);
      }
    }

    if (coin) {
      if (coin.fdvMcRatio > 3) {
        risks.push(`High dilution risk (FDV/MC: ${coin.fdvMcRatio.toFixed(1)}x)`);
      }
      if (coin.volume24h < 500_000) {
        risks.push('Low trading volume — potential liquidity issues');
      }
    }

    return risks;
  }

  /**
   * Determine final verdict based on all analysis layers.
   */
  private determineVerdict(
    coin: CoinData | null,
    smc: SmcAnalysis | null,
    forensic: ForensicAuditResult | null,
    convergence: SmcConvergenceResult | null,
    manipulation: ManipulationGuardResult | null,
    dynamicScore?: DynamicScoreResult,
  ): 'ULTRA_GEM' | 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'AVOID' {
    // Hard rejections
    if (forensic && !forensic.isApproved) return 'AVOID';
    if (manipulation && manipulation.isManipulated) return 'AVOID';
    if (forensic && forensic.overallRiskLevel === 'CRITICAL') return 'AVOID';

    // Ultra Gem check
    if (
      convergence &&
      convergence.isUltraGem &&
      smc &&
      smc.bias === 'BULLISH' &&
      forensic &&
      forensic.isApproved
    ) {
      return 'ULTRA_GEM';
    }

    // Score-based verdict
    const score = dynamicScore?.finalScore ?? coin?.alphaScore ?? 0;

    if (
      score >= 20 &&
      smc &&
      smc.bias === 'BULLISH' &&
      forensic &&
      forensic.isApproved
    ) {
      return 'STRONG_BUY';
    }

    if (score >= 15 && (!forensic || forensic.isApproved)) {
      return 'BUY';
    }

    if (score >= 10) {
      return 'NEUTRAL';
    }

    return 'AVOID';
  }

  /**
   * Calculate confidence level for the verdict (0-1).
   */
  private calculateConfidence(
    coin: CoinData | null,
    smc: SmcAnalysis | null,
    forensic: ForensicAuditResult | null,
    convergence: SmcConvergenceResult | null,
  ): number {
    let confidence = 0.3; // Base confidence

    // More data = higher confidence
    if (coin) confidence += 0.1;
    if (smc) confidence += 0.15;
    if (forensic) confidence += 0.15;
    if (convergence) confidence += 0.1;

    // Data quality bonuses
    if (coin && coin.dataSources.length >= 3) confidence += 0.1;
    if (smc && smc.orderBlocks.length > 0) confidence += 0.05;
    if (forensic && forensic.contractSecurity.isOpenSource) confidence += 0.05;

    return Math.min(1, Math.round(confidence * 100) / 100);
  }

  /**
   * Compose the final human-readable narrative.
   */
  private composeNarrative(
    symbol: string,
    verdict: string,
    reasoning: ReasoningChain,
    catalysts: string[],
    risks: string[],
  ): string {
    const parts: string[] = [];

    parts.push(`[${verdict}] ${symbol}`);
    parts.push('');
    parts.push(`Market: ${reasoning.marketContext}`);
    parts.push(`Technical: ${reasoning.technicalAnalysis}`);
    parts.push(`Security: ${reasoning.securityAssessment}`);

    if (catalysts.length > 0) {
      parts.push('');
      parts.push(`Catalysts: ${catalysts.join('; ')}`);
    }

    if (risks.length > 0) {
      parts.push(`Risks: ${risks.join('; ')}`);
    }

    parts.push('');
    parts.push(`Conclusion: ${reasoning.finalConclusion}`);

    return parts.join('\n');
  }
}
