import { CoinData } from '../../types';
import { BinanceAdapter } from '../../adapters/binance';
import { CircuitBreaker } from '../utils/circuit-breaker';
import {
  ElizaCharacter,
  ElizaDecision,
  ElizaPluginReport,
  ReActStep,
  ReActTrace,
  SmcAnalysis,
  ForensicAuditResult,
  NarrativeMapResult,
  ManipulationGuardResult,
  SmcConvergenceResult,
  BtcGateResult,
  MasterScoreResult,
  AlphaReport,
  ReasoningChain,
} from '../types';
import characterConfig from './hedge-fund-manager.character.json';

/**
 * ElizaOS-style Agentic Orchestrator
 *
 * Reference: elizaOS/eliza
 *
 * Implements the ReAct (Reason + Act) pattern where the orchestrator:
 *   1. Receives reports from sub-agent plugins (Forensic, SMC, Narrative)
 *   2. Reasons about the data using chain-of-thought
 *   3. Produces structured JSON decisions
 *   4. Manages multi-agent feedback loops
 *
 * Sub-Agents (Plugins):
 *   - Plugin-Forensic: GoPlus & Whale tracking specialist
 *   - Plugin-SMC: Technical pattern detection specialist
 *   - Plugin-Narrative: News & trend alignment specialist
 *   - Plugin-Risk: Anti-manipulation guard specialist
 */
export class ElizaOrchestrator {
  private character: ElizaCharacter;
  private binance: BinanceAdapter;
  private circuitBreaker: CircuitBreaker;

  constructor() {
    this.character = {
      name: characterConfig.name,
      role: characterConfig.role,
      personality: characterConfig.personality,
      instructions: characterConfig.instructions,
      riskTolerance: characterConfig.riskTolerance as ElizaCharacter['riskTolerance'],
      minRiskRewardRatio: characterConfig.minRiskRewardRatio,
    };
    this.binance = new BinanceAdapter();
    this.circuitBreaker = new CircuitBreaker({
      name: 'eliza-orchestrator',
      failureThreshold: 3,
      resetTimeoutMs: 60_000,
    });
  }

  /**
   * Execute full ReAct reasoning loop.
   *
   * Pipeline: Gather plugin reports → Reason → Decide → Generate thesis
   */
  async evaluate(
    coin: CoinData,
    smcAnalysis: SmcAnalysis | null,
    forensicAudit: ForensicAuditResult | null,
    narrativeMap: NarrativeMapResult | null,
    manipulationGuard: ManipulationGuardResult | null,
    smcConvergence: SmcConvergenceResult | null,
    masterScore: MasterScoreResult | null,
  ): Promise<ReActTrace> {
    const steps: ReActStep[] = [];
    const startTime = Date.now();

    // Step 1: Gather plugin reports
    const pluginReports = this.gatherPluginReports(
      coin, smcAnalysis, forensicAudit, narrativeMap, manipulationGuard,
    );

    steps.push({
      thought: `Gathered ${pluginReports.length} plugin reports for ${coin.symbol}. ` +
        `Need to evaluate security, technicals, narrative, and manipulation risk.`,
      action: 'GATHER_REPORTS',
      observation: pluginReports.map(
        (r) => `${r.pluginName}: ${r.recommendation} (score: ${r.score.toFixed(1)})`,
      ).join('; '),
      timestamp: Date.now(),
    });

    // Step 2: Check BTC Gate
    const btcGate = await this.checkBtcGate();

    steps.push({
      thought: btcGate.isGateOpen
        ? `BTC Gate is OPEN (${btcGate.btcChange24h.toFixed(1)}% 24h). Proceeding with evaluation.`
        : `BTC Gate is CLOSED — BTC crashed ${btcGate.btcChange24h.toFixed(1)}%. All scores set to 0.`,
      action: 'CHECK_BTC_GATE',
      observation: `BTC: $${btcGate.btcPrice.toFixed(0)}, 24h: ${btcGate.btcChange24h.toFixed(2)}%, ` +
        `trend: ${btcGate.btcTrend}, gate: ${btcGate.gateValue.toFixed(2)}`,
      timestamp: Date.now(),
    });

    // Step 3: Evaluate each plugin's report
    for (const report of pluginReports) {
      const evaluation = this.evaluatePlugin(report);
      steps.push({
        thought: evaluation.thought,
        action: `EVALUATE_${report.pluginName.toUpperCase()}`,
        observation: evaluation.observation,
        timestamp: Date.now(),
      });
    }

    // Step 4: Apply character instructions (skepticism, risk/reward)
    const characterCheck = this.applyCharacterInstructions(
      coin, pluginReports, btcGate, smcConvergence,
    );

    steps.push({
      thought: characterCheck.thought,
      action: 'APPLY_CHARACTER_RULES',
      observation: characterCheck.observation,
      timestamp: Date.now(),
    });

    // Step 5: Make final decision
    const decision = this.makeDecision(
      coin, pluginReports, btcGate, smcConvergence, masterScore,
    );

    steps.push({
      thought: `Final evaluation complete for ${coin.symbol}. ` +
        `Decision: ${decision.decision} with ${(decision.confidence * 100).toFixed(0)}% confidence.`,
      action: 'FINAL_DECISION',
      observation: JSON.stringify(decision, null, 2),
      timestamp: Date.now(),
    });

    return {
      steps,
      finalDecision: decision,
      totalDurationMs: Date.now() - startTime,
    };
  }

  /**
   * Generate a full AlphaReport from ReAct trace.
   */
  generateAlphaReport(
    coin: CoinData,
    trace: ReActTrace,
    smcAnalysis: SmcAnalysis | null,
    forensicAudit: ForensicAuditResult | null,
    narrativeMap: NarrativeMapResult | null,
    _masterScore: MasterScoreResult | null,
  ): AlphaReport {
    const decision = trace.finalDecision;

    const verdictMap: Record<string, AlphaReport['verdict']> = {
      BUY: decision.confidence > 0.8 ? 'ULTRA_GEM' : decision.confidence > 0.6 ? 'STRONG_BUY' : 'BUY',
      HOLD: 'NEUTRAL',
      SELL: 'AVOID',
      AVOID: 'AVOID',
    };

    const verdict = verdictMap[decision.decision] || 'NEUTRAL';

    const reasoning: ReasoningChain = {
      marketContext: this.buildMarketContext(coin),
      technicalAnalysis: this.buildTechnicalAnalysis(smcAnalysis),
      fundamentalAnalysis: this.buildFundamentalAnalysis(coin, narrativeMap),
      securityAssessment: this.buildSecurityAssessment(forensicAudit),
      narrativeFit: this.buildNarrativeFit(narrativeMap),
      finalConclusion: decision.investment_thesis,
    };

    return {
      symbol: coin.symbol,
      verdict,
      confidence: decision.confidence,
      narrative: decision.investment_thesis,
      reasoning,
      catalysts: decision.catalysts,
      risks: decision.risks,
      timestamp: Date.now(),
    };
  }

  /**
   * Gather reports from each sub-agent plugin.
   */
  private gatherPluginReports(
    coin: CoinData,
    smc: SmcAnalysis | null,
    forensic: ForensicAuditResult | null,
    narrative: NarrativeMapResult | null,
    manipulation: ManipulationGuardResult | null,
  ): ElizaPluginReport[] {
    const reports: ElizaPluginReport[] = [];

    // Plugin-Forensic
    if (forensic) {
      const findings: string[] = [];
      if (forensic.contractSecurity.hasMintFunction) findings.push('Has mint function');
      if (forensic.contractSecurity.hasProxyContract) findings.push('Proxy contract detected');
      if (forensic.contractSecurity.honeypotRisk === 'HIGH') findings.push('HONEYPOT RISK');
      if (forensic.whaleAnalysis.isConcentrated) findings.push(`Whale concentration: ${forensic.whaleAnalysis.top10NonExchangePct.toFixed(1)}%`);
      if (forensic.contractSecurity.isLiquidityLocked) findings.push('Liquidity locked');
      findings.push(...forensic.riskFlags.slice(0, 5));

      reports.push({
        pluginName: 'Forensic',
        symbol: coin.symbol,
        findings,
        score: forensic.overallRiskLevel === 'SAFE' ? 9 : forensic.overallRiskLevel === 'CAUTION' ? 6 : forensic.overallRiskLevel === 'DANGER' ? 3 : 1,
        recommendation: forensic.isApproved ? 'POSITIVE' : 'NEGATIVE',
        rawData: forensic,
      });
    }

    // Plugin-SMC
    if (smc) {
      const findings: string[] = [];
      if (smc.marketStructure.mssDetected) findings.push(`MSS detected: ${smc.marketStructure.mssType}`);
      findings.push(`Trend: ${smc.marketStructure.currentTrend}`);
      findings.push(`Active OBs: ${smc.orderBlocks.filter((ob) => !ob.isMitigated).length}`);
      findings.push(`Open FVGs: ${smc.fairValueGaps.filter((f) => !f.isFilled).length}`);
      findings.push(`Swept levels: ${smc.liquidityLevels.filter((l) => l.isSwept).length}`);

      reports.push({
        pluginName: 'SMC',
        symbol: coin.symbol,
        findings,
        score: smc.smcScore,
        recommendation: smc.smcScore >= 6 ? 'POSITIVE' : smc.smcScore >= 3 ? 'NEUTRAL' : 'NEGATIVE',
        rawData: smc,
      });
    }

    // Plugin-Narrative
    if (narrative) {
      const findings: string[] = narrative.matchedNarratives.map(
        (n) => `${n.narrative}: ${(n.relevanceScore * 100).toFixed(0)}% match${n.isTrending ? ' (TRENDING)' : ''}`,
      );

      reports.push({
        pluginName: 'Narrative',
        symbol: coin.symbol,
        findings,
        score: narrative.adjustedNarrativeScore * 2,
        recommendation: narrative.adjustedNarrativeScore > 3 ? 'POSITIVE' : narrative.adjustedNarrativeScore > 1 ? 'NEUTRAL' : 'NEGATIVE',
        rawData: narrative,
      });
    }

    // Plugin-Risk (Anti-Manipulation)
    if (manipulation) {
      const findings: string[] = manipulation.manipulationFlags.map(
        (f) => `${f.type}: ${f.evidence.slice(0, 80)}`,
      );
      if (manipulation.washTradingProbability > 0.3) {
        findings.push(`Wash trading probability: ${(manipulation.washTradingProbability * 100).toFixed(0)}%`);
      }

      reports.push({
        pluginName: 'Risk',
        symbol: coin.symbol,
        findings,
        score: Math.max(0, 10 - manipulation.washTradingProbability * 10),
        recommendation: manipulation.isManipulated ? 'NEGATIVE' : manipulation.washTradingProbability > 0.3 ? 'NEUTRAL' : 'POSITIVE',
        rawData: manipulation,
      });
    }

    return reports;
  }

  /**
   * Check BTC Gate — if BTC is crashing, gate closes.
   */
  async checkBtcGate(): Promise<BtcGateResult> {
    try {
      return await this.circuitBreaker.execute(async () => {
        const klines = await this.binance.fetchKlines('BTC', '1d', 8);

        if (klines.length < 2) {
          return this.defaultBtcGate();
        }

        const currentPrice = parseFloat(klines[klines.length - 1].close);
        const prevPrice = parseFloat(klines[klines.length - 2].close);
        const btcChange24h = ((currentPrice - prevPrice) / prevPrice) * 100;

        let btcChange7d = 0;
        if (klines.length >= 8) {
          const weekAgoPrice = parseFloat(klines[klines.length - 8].close);
          btcChange7d = ((currentPrice - weekAgoPrice) / weekAgoPrice) * 100;
        }

        let btcTrend: BtcGateResult['btcTrend'] = 'NEUTRAL';
        if (btcChange24h > 2 && btcChange7d > 3) btcTrend = 'BULLISH';
        else if (btcChange24h < -2 || btcChange7d < -5) btcTrend = 'BEARISH';

        // BTC Gate: 0 if BTC crashes > threshold, 1 if bullish, scaled in between
        let gateValue = 1;
        const threshold = this.character.riskTolerance === 'LOW' ? -3 : -5;

        if (btcChange24h < threshold) {
          gateValue = 0;
        } else if (btcChange24h < 0) {
          gateValue = Math.max(0.3, 1 + btcChange24h / 10);
        }

        return {
          btcPrice: currentPrice,
          btcChange24h,
          btcChange7d,
          btcTrend,
          gateValue: Math.round(gateValue * 100) / 100,
          isGateOpen: gateValue > 0,
        };
      });
    } catch {
      return this.defaultBtcGate();
    }
  }

  private defaultBtcGate(): BtcGateResult {
    return { btcPrice: 0, btcChange24h: 0, btcChange7d: 0, btcTrend: 'NEUTRAL', gateValue: 1, isGateOpen: true };
  }

  /**
   * Calculate Master Score using the enhanced formula:
   * Score_Master = (w1·S_SMC + w2·S_Narrative + w3·S_Security) / Risk_Volatility × BTC_Gate
   */
  calculateMasterScore(
    smcScore: number,
    narrativeScore: number,
    securityScore: number,
    volatility: number,
    btcGate: BtcGateResult,
  ): MasterScoreResult {
    const w1 = 1.2; // SMC weight
    const w2 = 0.8; // Narrative weight
    const w3 = 1.5; // Security weight

    const rawScore = w1 * smcScore + w2 * narrativeScore + w3 * securityScore;
    const riskVolatility = Math.max(1, 1 + volatility);
    const gate = btcGate.gateValue;
    const finalScore = (rawScore / riskVolatility) * gate;

    return {
      smcScore,
      narrativeScore,
      securityScore,
      riskVolatility,
      btcGate: gate,
      rawScore: Math.round(rawScore * 100) / 100,
      finalScore: Math.round(finalScore * 100) / 100,
      formula: `(${w1}·${smcScore.toFixed(1)} + ${w2}·${narrativeScore.toFixed(1)} + ${w3}·${securityScore.toFixed(1)}) / ${riskVolatility.toFixed(2)} × ${gate.toFixed(2)}`,
      weights: { w1, w2, w3 },
    };
  }

  private evaluatePlugin(report: ElizaPluginReport): { thought: string; observation: string } {
    const findings = report.findings.join(', ');

    switch (report.pluginName) {
      case 'Forensic':
        return {
          thought: report.recommendation === 'NEGATIVE'
            ? `CRITICAL: Forensic audit FAILED for ${report.symbol}. Character instruction: reject coins with security red flags.`
            : `Forensic audit passed with score ${report.score.toFixed(1)}/10. Checking for specific risks.`,
          observation: `Findings: ${findings}. Recommendation: ${report.recommendation}.`,
        };
      case 'SMC':
        return {
          thought: `SMC analysis shows score ${report.score.toFixed(1)}/10. Character requires minimum score of 4 for consideration.`,
          observation: `Findings: ${findings}. Recommendation: ${report.recommendation}.`,
        };
      case 'Narrative':
        return {
          thought: `Narrative alignment score: ${report.score.toFixed(1)}/10. Checking if coin aligns with trending themes.`,
          observation: `Findings: ${findings}. Recommendation: ${report.recommendation}.`,
        };
      case 'Risk':
        return {
          thought: report.recommendation === 'NEGATIVE'
            ? `ALERT: Manipulation detected for ${report.symbol}. Character instruction: flag and reduce score.`
            : `Risk assessment clean with score ${report.score.toFixed(1)}/10.`,
          observation: `Findings: ${findings}. Recommendation: ${report.recommendation}.`,
        };
      default:
        return {
          thought: `Unknown plugin ${report.pluginName} reported.`,
          observation: findings,
        };
    }
  }

  private applyCharacterInstructions(
    coin: CoinData,
    reports: ElizaPluginReport[],
    btcGate: BtcGateResult,
    convergence: SmcConvergenceResult | null,
  ): { thought: string; observation: string } {
    const issues: string[] = [];

    // Check minimum risk-to-reward
    if (coin.priceChange24h > 50) {
      issues.push(`Price already pumped ${coin.priceChange24h.toFixed(0)}% — may not offer 1:3 R/R`);
    }

    // Check BTC Gate
    if (!btcGate.isGateOpen) {
      issues.push('BTC Gate is CLOSED — all entries suspended');
    }

    // Check forensic
    const forensicReport = reports.find((r) => r.pluginName === 'Forensic');
    if (forensicReport && forensicReport.recommendation === 'NEGATIVE') {
      issues.push('Forensic audit FAILED — character rejects this coin');
    }

    // Check manipulation
    const riskReport = reports.find((r) => r.pluginName === 'Risk');
    if (riskReport && riskReport.recommendation === 'NEGATIVE') {
      issues.push('Manipulation detected — character flags this as untradeable');
    }

    // Check convergence for Ultra Gem
    if (convergence && convergence.isUltraGem) {
      issues.push('Ultra Gem signal detected — institutional footprint confirmed');
    }

    return {
      thought: issues.length > 0
        ? `Character "${this.character.name}" identified ${issues.length} concern(s): ${issues.join('; ')}`
        : `Character "${this.character.name}" has no concerns — all criteria met.`,
      observation: issues.length > 0
        ? `Issues: ${issues.join(' | ')}`
        : 'All character instructions satisfied. Clear for evaluation.',
    };
  }

  private makeDecision(
    coin: CoinData,
    reports: ElizaPluginReport[],
    btcGate: BtcGateResult,
    convergence: SmcConvergenceResult | null,
    masterScore: MasterScoreResult | null,
  ): ElizaDecision {
    // Hard rejections
    if (!btcGate.isGateOpen) {
      return this.buildDecision(coin, 'AVOID', 'Critical', 0.95,
        'BTC Gate is CLOSED. Market in crash mode — no entries.', [], ['BTC crash']);
    }

    const forensic = reports.find((r) => r.pluginName === 'Forensic');
    if (forensic && forensic.recommendation === 'NEGATIVE') {
      return this.buildDecision(coin, 'AVOID', 'High', 0.9,
        `Forensic audit FAILED: ${forensic.findings.slice(0, 3).join(', ')}.`,
        [], forensic.findings);
    }

    const risk = reports.find((r) => r.pluginName === 'Risk');
    if (risk && risk.recommendation === 'NEGATIVE') {
      return this.buildDecision(coin, 'AVOID', 'High', 0.85,
        `Manipulation detected: ${risk.findings[0] || 'suspicious activity'}.`,
        [], risk.findings);
    }

    // Score-based decision
    const avgScore = reports.reduce((s, r) => s + r.score, 0) / Math.max(1, reports.length);
    const smc = reports.find((r) => r.pluginName === 'SMC');
    const narrative = reports.find((r) => r.pluginName === 'Narrative');

    const catalysts: string[] = [];
    const risks: string[] = [];

    if (smc && smc.score >= 6) catalysts.push(`Strong SMC setup (${smc.score.toFixed(1)}/10)`);
    if (narrative && narrative.recommendation === 'POSITIVE') catalysts.push('Trending narrative alignment');
    if (convergence && convergence.isUltraGem) catalysts.push('Institutional entry signal (Ultra Gem)');
    if (forensic && forensic.recommendation === 'POSITIVE') catalysts.push('Clean forensic audit');

    if (risk && risk.score < 7) risks.push(`Manipulation risk: ${risk.score.toFixed(1)}/10`);
    if (btcGate.gateValue < 0.8) risks.push(`BTC weakness: gate ${btcGate.gateValue.toFixed(2)}`);
    if (smc && smc.score < 4) risks.push('Weak SMC setup');

    // Decision logic
    if (avgScore >= 7.5 && convergence?.isUltraGem) {
      return this.buildDecision(coin, 'BUY', 'Low', Math.min(0.95, avgScore / 10),
        this.buildThesis(coin, reports, btcGate, masterScore), catalysts, risks);
    }
    if (avgScore >= 6) {
      return this.buildDecision(coin, 'BUY', 'Medium', Math.min(0.85, avgScore / 12),
        this.buildThesis(coin, reports, btcGate, masterScore), catalysts, risks);
    }
    if (avgScore >= 4) {
      return this.buildDecision(coin, 'HOLD', 'Medium', 0.5,
        `${coin.symbol} shows mixed signals. Monitoring for confirmation.`, catalysts, risks);
    }

    return this.buildDecision(coin, 'AVOID', 'High', 0.6,
      `${coin.symbol} fails minimum criteria. Average score: ${avgScore.toFixed(1)}/10.`, catalysts, risks);
  }

  private buildDecision(
    coin: CoinData, decision: ElizaDecision['decision'],
    riskLevel: ElizaDecision['risk_level'], confidence: number,
    thesis: string, catalysts: string[], risks: string[],
  ): ElizaDecision {
    return {
      decision,
      reasoning: `${this.character.name} evaluates ${coin.symbol}: ${thesis}`,
      risk_level: riskLevel,
      confidence: Math.round(confidence * 100) / 100,
      investment_thesis: thesis,
      catalysts,
      risks,
      position_sizing: decision === 'BUY' ? Math.min(0.05, confidence * 0.05) : 0,
      timestamp: Date.now(),
    };
  }

  private buildThesis(
    coin: CoinData,
    reports: ElizaPluginReport[],
    btcGate: BtcGateResult,
    masterScore: MasterScoreResult | null,
  ): string {
    const parts: string[] = [];
    parts.push(`${coin.symbol} is a valid alpha candidate.`);

    const smc = reports.find((r) => r.pluginName === 'SMC');
    if (smc) parts.push(`Technical: ${smc.findings[0] || 'SMC patterns detected'}.`);

    const forensic = reports.find((r) => r.pluginName === 'Forensic');
    if (forensic) parts.push(`Security: ${forensic.recommendation === 'POSITIVE' ? 'Clean audit' : 'Caution flags'}.`);

    const narrative = reports.find((r) => r.pluginName === 'Narrative');
    if (narrative && narrative.findings.length > 0) parts.push(`Narrative: ${narrative.findings[0]}.`);

    if (masterScore) parts.push(`Master Score: ${masterScore.finalScore.toFixed(2)}.`);
    parts.push(`BTC Gate: ${btcGate.gateValue.toFixed(2)} (${btcGate.btcTrend}).`);

    return parts.join(' ');
  }

  private buildMarketContext(coin: CoinData): string {
    return `${coin.symbol} at $${coin.price?.toFixed(6) || '?'}, MC: $${(coin.marketCap / 1e6).toFixed(1)}M, ` +
      `24h change: ${coin.priceChange24h?.toFixed(1) || '?'}%, Vol: $${(coin.volume24h / 1e6).toFixed(1)}M.`;
  }

  private buildTechnicalAnalysis(smc: SmcAnalysis | null): string {
    if (!smc) return 'No SMC data available.';
    const parts = [`Trend: ${smc.marketStructure.currentTrend}. Bias: ${smc.bias}.`];
    if (smc.marketStructure.mssDetected) parts.push(`MSS: ${smc.marketStructure.mssType}.`);
    parts.push(`Active OBs: ${smc.orderBlocks.filter((o) => !o.isMitigated).length}, Open FVGs: ${smc.fairValueGaps.filter((f) => !f.isFilled).length}.`);
    return parts.join(' ');
  }

  private buildFundamentalAnalysis(coin: CoinData, narrative: NarrativeMapResult | null): string {
    const parts = [`MC/Vol ratio: ${(coin.volume24h / Math.max(1, coin.marketCap)).toFixed(3)}.`];
    if (narrative && narrative.matchedNarratives.length > 0) {
      parts.push(`Narratives: ${narrative.matchedNarratives.map((n) => n.narrative).join(', ')}.`);
    }
    return parts.join(' ');
  }

  private buildSecurityAssessment(forensic: ForensicAuditResult | null): string {
    if (!forensic) return 'No forensic data available.';
    return `Risk: ${forensic.overallRiskLevel}. Flags: ${forensic.riskFlags.length > 0 ? forensic.riskFlags.join(', ') : 'None'}.`;
  }

  private buildNarrativeFit(narrative: NarrativeMapResult | null): string {
    if (!narrative) return 'No narrative data available.';
    return `Score: ${narrative.adjustedNarrativeScore.toFixed(2)}/5. ` +
      `Matches: ${narrative.matchedNarratives.map((n) => `${n.narrative}(${(n.relevanceScore * 100).toFixed(0)}%)`).join(', ') || 'None'}.`;
  }
}
