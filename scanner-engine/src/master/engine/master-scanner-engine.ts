import { ScannerEngine } from '../../core/scanner-engine';
import { logger } from '../../utils/logger';

import { StreamIngestor } from '../ingestor';
import { SmcProcessor, DynamicScorer } from '../pattern-brain';
import { ForensicAuditEngine } from '../forensic-shield';
import { ElizaOrchestrator } from '../agents';
import { SmcConvergenceEngine, AntiManipulationGuard, NarrativeMapper } from '../modules';
import { AutoOptimizer } from '../optimizer';
import {
  MasterConfig,
  MasterPipelineResult,
  MasterScanSummary,
  IDataProvider,
  SmcAnalysis,
  ForensicAuditResult,
  ManipulationGuardResult,
  NarrativeMapResult,
  SmcConvergenceResult,
  MasterScoreResult,
  DynamicScoreResult,
} from '../types';

const DEFAULT_MASTER_CONFIG: MasterConfig = {
  ingestor: {
    binanceWsUrl: 'wss://stream.binance.com:9443/ws',
    heliusRpcUrl: process.env.HELIUS_RPC_URL || null,
    maxStreams: 50,
    reconnectIntervalMs: 5000,
    heartbeatIntervalMs: 30000,
  },
  enableSmc: true,
  enableForensics: true,
  enableNarrative: true,
  enableAntiManipulation: true,
  enableAutoOptimization: true,
  enableAgentic: true,
  smcTimeframes: ['1h', '4h', '1d'],
  forensicMinMarketCap: 5_000_000,
  optimizationIntervalMs: 24 * 60 * 60 * 1000,
  weights: {
    liquidity: 1.0,
    tokenomics: 1.0,
    marketCap: 1.0,
    momentum: 1.0,
    onChain: 1.0,
    smc: 1.2,
    forensic: 1.5,
    narrative: 0.8,
  },
};

/**
 * Master Scanner Engine — "Autonomous Intelligence Hub"
 *
 * Orchestrates the full pipeline with ElizaOS-style ReAct reasoning:
 *
 *   Layer 1: Ingestor      → WebSocket + Piscina worker threads
 *   Layer 2: Pattern Brain  → Vectorized SMC + Dynamic scoring
 *   Layer 3: Forensic Shield → GoPlus SDK + DeBank + cross-validation
 *   Layer 4: ElizaOS Agent  → ReAct reasoning + multi-plugin evaluation
 *
 * Premium Modules:
 *   - Smart Money Convergence (Liquidity Grab detection)
 *   - Anti-Manipulation Guard (Benford's Law + spread variance)
 *   - Automated Narrative Mapper (Cosine Similarity + TF-IDF)
 *   - Auto-Optimization (weight tuning via F1 score)
 *
 * Master Scoring Formula:
 *   Score = (w1·S_SMC + w2·S_Narrative + w3·S_Security) / Risk_Volatility × BTC_Gate
 *
 * If BTC_Gate = 0 (crash), all scores become 0.
 */
export class MasterScannerEngine {
  private config: MasterConfig;
  private adapters: IDataProvider[] = [];

  private scanner: ScannerEngine;
  private ingestor: StreamIngestor;
  private smcProcessor: SmcProcessor;
  private dynamicScorer: DynamicScorer;
  private forensicEngine: ForensicAuditEngine;
  private elizaOrchestrator: ElizaOrchestrator;
  private smcConvergence: SmcConvergenceEngine;
  private antiManipulation: AntiManipulationGuard;
  private narrativeMapper: NarrativeMapper;
  private autoOptimizer: AutoOptimizer;

  constructor(config?: Partial<MasterConfig>) {
    this.config = { ...DEFAULT_MASTER_CONFIG, ...config };

    this.scanner = new ScannerEngine();
    this.ingestor = new StreamIngestor(this.config.ingestor);
    this.smcProcessor = new SmcProcessor();
    this.dynamicScorer = new DynamicScorer(this.config.weights);
    this.forensicEngine = new ForensicAuditEngine();
    this.elizaOrchestrator = new ElizaOrchestrator();
    this.smcConvergence = new SmcConvergenceEngine();
    this.antiManipulation = new AntiManipulationGuard();
    this.narrativeMapper = new NarrativeMapper();
    this.autoOptimizer = new AutoOptimizer(this.config.weights);
  }

  /**
   * Execute the full Autonomous Intelligence Suite.
   *
   * Pipeline (11 stages):
   *   0. Base scan (existing ScannerEngine)
   *   1. Stream ingestor (order book snapshots)
   *   2. SMC analysis (vectorized OB, FVG, MSS)
   *   3. Forensic audit (GoPlus + DeBank + cross-validation)
   *   4. Anti-manipulation (Benford's Law + spread variance + 1m spikes)
   *   5. Narrative mapping (cosine similarity + TF-IDF)
   *   6. SMC Convergence (liquidity grab detection)
   *   7. BTC Gate check
   *   8. Master scoring formula
   *   9. ElizaOS ReAct reasoning + Alpha reports
   *  10. Auto-optimization (weight tuning)
   */
  async runIntelligenceSuite(): Promise<MasterScanSummary> {
    const startTime = Date.now();

    logger.info('='.repeat(70));
    logger.info('  AUTONOMOUS INTELLIGENCE HUB — MASTER SCANNER ENGINE');
    logger.info('='.repeat(70));
    logger.info({ config: this.configSummary() }, 'Master configuration');

    // ================================================================
    // Stage 0: Base Discovery
    // ================================================================
    logger.info('━━━ Stage 0: Base Discovery (Scanner Engine) ━━━');
    const allCoins = await this.scanner.scan();
    logger.info({ candidates: allCoins.length }, 'Base scan complete');

    if (allCoins.length === 0) {
      logger.info('No candidates found. Pipeline ends.');
      return this.emptySummary(startTime);
    }

    // Sort by alpha score and take top candidates
    const candidates = allCoins
      .sort((a, b) => b.alphaScore - a.alphaScore)
      .slice(0, 30);

    logger.info({ candidates: candidates.length }, 'Top candidates selected for deep analysis');

    // ================================================================
    // Stage 1: Stream Ingestor (order book snapshots)
    // ================================================================
    logger.info('━━━ Stage 1: Stream Ingestor (Order Book Snapshots) ━━━');
    for (const coin of candidates.slice(0, 10)) {
      try {
        const snapshot = await this.ingestor.fetchOrderBookSnapshot(coin.symbol);
        logger.info(
          { symbol: coin.symbol, imbalance: snapshot.imbalanceRatio.toFixed(3) },
          'Order book captured',
        );
      } catch {
        logger.debug({ symbol: coin.symbol }, 'Order book fetch skipped');
      }
    }

    // ================================================================
    // Stage 2: SMC Analysis (Vectorized)
    // ================================================================
    logger.info('━━━ Stage 2: SMC Pattern Brain (Vectorized OB/FVG/MSS) ━━━');
    const smcResults = new Map<string, SmcAnalysis>();
    if (this.config.enableSmc) {
      for (const coin of candidates) {
        try {
          const analysis = await this.smcProcessor.analyze(coin.symbol, this.config.smcTimeframes);
          smcResults.set(coin.symbol, analysis);
          logger.info(
            { symbol: coin.symbol, bias: analysis.bias, score: analysis.smcScore, mss: analysis.marketStructure.mssDetected },
            'SMC analysis',
          );
        } catch {
          logger.debug({ symbol: coin.symbol }, 'SMC analysis skipped');
        }
      }
    }

    // ================================================================
    // Stage 3: Forensic Shield (GoPlus + DeBank + Cross-validation)
    // ================================================================
    logger.info('━━━ Stage 3: Forensic Shield (GoPlus SDK + DeBank) ━━━');
    const forensicResults = new Map<string, ForensicAuditResult>();
    if (this.config.enableForensics) {
      for (const coin of candidates) {
        if (coin.marketCap < this.config.forensicMinMarketCap) continue;
        try {
          const audit = await this.forensicEngine.audit(coin);
          forensicResults.set(coin.symbol, audit);
          logger.info(
            { symbol: coin.symbol, risk: audit.overallRiskLevel, approved: audit.isApproved, flags: audit.riskFlags.length },
            'Forensic audit',
          );
        } catch {
          logger.debug({ symbol: coin.symbol }, 'Forensic audit skipped');
        }
      }
    }

    // ================================================================
    // Stage 4: Anti-Manipulation Guard (Benford's Law + Spread Variance)
    // ================================================================
    logger.info('━━━ Stage 4: Anti-Manipulation Guard (Benford + Spread + 1m Spikes) ━━━');
    const manipResults = new Map<string, ManipulationGuardResult>();
    if (this.config.enableAntiManipulation) {
      for (const coin of candidates) {
        try {
          const result = await this.antiManipulation.analyze(coin);
          manipResults.set(coin.symbol, result);
          if (result.isManipulated) {
            logger.warn({ symbol: coin.symbol, prob: result.washTradingProbability, flags: result.manipulationFlags.length }, 'MANIPULATION DETECTED');
          }
        } catch {
          logger.debug({ symbol: coin.symbol }, 'Anti-manipulation skipped');
        }
      }
    }

    // ================================================================
    // Stage 5: Narrative Mapper (Cosine Similarity + TF-IDF)
    // ================================================================
    logger.info('━━━ Stage 5: Narrative Mapper (Cosine Similarity + News) ━━━');
    const narrativeResults = new Map<string, NarrativeMapResult>();
    if (this.config.enableNarrative) {
      for (const coin of candidates) {
        try {
          const result = await this.narrativeMapper.analyze(coin);
          narrativeResults.set(coin.symbol, result);
          if (result.matchedNarratives.length > 0) {
            logger.info(
              { symbol: coin.symbol, narratives: result.matchedNarratives.map((n) => n.narrative).join(', '), score: result.adjustedNarrativeScore },
              'Narrative match',
            );
          }
        } catch {
          logger.debug({ symbol: coin.symbol }, 'Narrative mapping skipped');
        }
      }
    }

    // ================================================================
    // Stage 6: SMC Convergence
    // ================================================================
    logger.info('━━━ Stage 6: Smart Money Convergence ━━━');
    const convergenceResults = new Map<string, SmcConvergenceResult>();
    for (const coin of candidates) {
      try {
        const smc = smcResults.get(coin.symbol) || null;
        const result = await this.smcConvergence.analyze(coin, smc ?? undefined);
        convergenceResults.set(coin.symbol, result);
        if (result.isUltraGem) {
          logger.info({ symbol: coin.symbol, signal: result.institutionalSignal }, '⚡ ULTRA GEM DETECTED');
        }
      } catch {
        logger.debug({ symbol: coin.symbol }, 'Convergence analysis skipped');
      }
    }

    // ================================================================
    // Stage 7: BTC Gate Check
    // ================================================================
    logger.info('━━━ Stage 7: BTC Gate Check ━━━');
    const btcGate = await this.elizaOrchestrator.checkBtcGate();
    logger.info(
      { price: btcGate.btcPrice, change24h: btcGate.btcChange24h.toFixed(2), trend: btcGate.btcTrend, gate: btcGate.gateValue },
      'BTC Gate status',
    );

    // ================================================================
    // Stage 8: Master Scoring (BTC Gate formula)
    // ================================================================
    logger.info('━━━ Stage 8: Master Scoring Formula ━━━');
    const masterScores = new Map<string, MasterScoreResult>();
    const dynamicScores = new Map<string, DynamicScoreResult>();

    for (const coin of candidates) {
      try {
        const smc = smcResults.get(coin.symbol);
        const forensic = forensicResults.get(coin.symbol);
        const narrative = narrativeResults.get(coin.symbol);

        // Dynamic score (original formula)
        const dynScore = await this.dynamicScorer.calculate(
          coin, smc || null, forensic || null, narrative || null,
        );
        dynamicScores.set(coin.symbol, dynScore);

        // Master score (new BTC Gate formula)
        const smcScore = smc ? smc.smcScore : 0;
        const narrativeScore = narrative ? narrative.adjustedNarrativeScore * 2 : 0;
        const securityScore = forensic ? (forensic.overallRiskLevel === 'SAFE' ? 10 : forensic.overallRiskLevel === 'CAUTION' ? 6 : 2) : 5;
        const volatility = (dynScore.rawScore / Math.max(0.01, dynScore.volatilityAdjustedScore)) - 1;

        const masterScore = this.elizaOrchestrator.calculateMasterScore(
          smcScore, narrativeScore, securityScore, volatility, btcGate,
        );
        masterScores.set(coin.symbol, masterScore);

        logger.info(
          { symbol: coin.symbol, masterScore: masterScore.finalScore, formula: masterScore.formula },
          'Master score',
        );
      } catch {
        logger.debug({ symbol: coin.symbol }, 'Scoring skipped');
      }
    }

    // ================================================================
    // Stage 9: ElizaOS ReAct Reasoning + Alpha Reports
    // ================================================================
    logger.info('━━━ Stage 9: ElizaOS Agentic Orchestrator (ReAct) ━━━');
    const results: MasterPipelineResult[] = [];

    if (this.config.enableAgentic) {
      for (const coin of candidates) {
        try {
          const smc = smcResults.get(coin.symbol) || null;
          const forensic = forensicResults.get(coin.symbol) || null;
          const narrative = narrativeResults.get(coin.symbol) || null;
          const manipulation = manipResults.get(coin.symbol) || null;
          const convergence = convergenceResults.get(coin.symbol) || null;
          const masterScore = masterScores.get(coin.symbol) || null;
          const dynScore = dynamicScores.get(coin.symbol);

          // Run ElizaOS ReAct loop (pass pre-computed btcGate to avoid redundant API calls)
          const trace = await this.elizaOrchestrator.evaluate(
            coin, smc, forensic, narrative, manipulation, convergence, masterScore, btcGate,
          );

          // Generate alpha report from trace
          const alphaReport = this.elizaOrchestrator.generateAlphaReport(
            coin, trace, smc, forensic, narrative, masterScore,
          );

          const pipelineResult: MasterPipelineResult = {
            symbol: coin.symbol,
            coin,
            smcAnalysis: smc,
            forensicAudit: forensic,
            smcConvergence: convergence,
            manipulationGuard: manipulation,
            narrativeMap: narrative,
            alphaReport,
            dynamicScore: dynScore || {
              rawScore: 0, volatilityAdjustedScore: 0, correlationPenalty: 1,
              finalScore: 0, formula: 'N/A', weights: this.config.weights,
            },
            finalVerdict: alphaReport.verdict,
            timestamp: Date.now(),
          };

          results.push(pipelineResult);

          logger.info(
            {
              symbol: coin.symbol,
              verdict: alphaReport.verdict,
              confidence: alphaReport.confidence.toFixed(2),
              decision: trace.finalDecision.decision,
              riskLevel: trace.finalDecision.risk_level,
              masterScore: masterScore?.finalScore?.toFixed(2),
              steps: trace.steps.length,
            },
            'ElizaOS verdict',
          );
        } catch {
          logger.debug({ symbol: coin.symbol }, 'Agentic analysis skipped');
        }
      }
    } else {
      // Fallback without ElizaOS
      for (const coin of candidates) {
        const dynScore = dynamicScores.get(coin.symbol);
        results.push({
          symbol: coin.symbol,
          coin,
          smcAnalysis: smcResults.get(coin.symbol) || null,
          forensicAudit: forensicResults.get(coin.symbol) || null,
          smcConvergence: convergenceResults.get(coin.symbol) || null,
          manipulationGuard: manipResults.get(coin.symbol) || null,
          narrativeMap: narrativeResults.get(coin.symbol) || null,
          alphaReport: null,
          dynamicScore: dynScore || {
            rawScore: 0, volatilityAdjustedScore: 0, correlationPenalty: 1,
            finalScore: 0, formula: 'N/A', weights: this.config.weights,
          },
          finalVerdict: dynScore && dynScore.finalScore > 15 ? 'STRONG_BUY' : 'NEUTRAL',
          timestamp: Date.now(),
        });
      }
    }

    // Sort by score
    results.sort((a, b) => b.dynamicScore.finalScore - a.dynamicScore.finalScore);

    // ================================================================
    // Stage 10: Auto-Optimization
    // ================================================================
    let optimizationApplied = false;
    if (this.config.enableAutoOptimization && results.length > 5) {
      logger.info('━━━ Stage 10: Auto-Optimization ━━━');
      try {
        const coins = results.map((r) => r.coin);
        const optResult = await this.autoOptimizer.optimize(coins, this.dynamicScorer);
        if (optResult.improvement > 0) {
          this.dynamicScorer.updateWeights(optResult.optimizedWeights);
          optimizationApplied = true;
          logger.info(
            { improvement: `${(optResult.improvement * 100).toFixed(1)}%`, f1: optResult.backtestResults.f1Score.toFixed(3) },
            'Weights optimized',
          );
        }
      } catch {
        logger.debug('Auto-optimization skipped');
      }
    }

    // ================================================================
    // Summary
    // ================================================================
    const summary: MasterScanSummary = {
      totalScanned: allCoins.length,
      passedSmc: results.filter((r) => r.smcAnalysis && r.smcAnalysis.smcScore >= 4).length,
      passedForensic: results.filter((r) => !r.forensicAudit || r.forensicAudit.isApproved).length,
      passedManipulation: results.filter((r) => !r.manipulationGuard?.isManipulated).length,
      ultraGems: results.filter((r) => r.finalVerdict === 'ULTRA_GEM').length,
      strongBuys: results.filter((r) => r.finalVerdict === 'STRONG_BUY').length,
      results,
      optimizationApplied,
      scanDurationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };

    this.printSummary(summary, btcGate);

    return summary;
  }

  private printSummary(
    summary: MasterScanSummary,
    btcGate: { btcPrice: number; btcChange24h: number; btcTrend: string; gateValue: number },
  ): void {
    logger.info('');
    logger.info('═'.repeat(70));
    logger.info('  AUTONOMOUS INTELLIGENCE HUB — SCAN RESULTS');
    logger.info('═'.repeat(70));
    logger.info(`  BTC: $${btcGate.btcPrice.toFixed(0)} (${btcGate.btcChange24h >= 0 ? '+' : ''}${btcGate.btcChange24h.toFixed(2)}%) | Gate: ${btcGate.gateValue.toFixed(2)} | Trend: ${btcGate.btcTrend}`);
    logger.info(`  Scanned: ${summary.totalScanned} | SMC Pass: ${summary.passedSmc} | Forensic Pass: ${summary.passedForensic} | Clean: ${summary.passedManipulation}`);
    logger.info(`  Ultra Gems: ${summary.ultraGems} | Strong Buys: ${summary.strongBuys}`);
    logger.info(`  Duration: ${(summary.scanDurationMs / 1000).toFixed(1)}s | Optimization: ${summary.optimizationApplied ? 'APPLIED' : 'skipped'}`);
    logger.info('─'.repeat(70));

    const top = summary.results.slice(0, 10);
    for (let i = 0; i < top.length; i++) {
      const r = top[i];
      const verdict = r.finalVerdict;
      const score = r.dynamicScore.finalScore.toFixed(2);
      const smc = r.smcAnalysis?.bias || 'N/A';
      const forensic = r.forensicAudit?.overallRiskLevel || 'N/A';
      const narrative = r.narrativeMap?.matchedNarratives[0]?.narrative || 'none';
      const decision = r.alphaReport?.verdict || verdict;

      logger.info(
        `  #${i + 1} ${r.symbol.padEnd(8)} | ${decision.padEnd(11)} | Score: ${score.padStart(7)} | SMC: ${smc.padEnd(8)} | Risk: ${forensic.padEnd(8)} | Narrative: ${narrative}`,
      );

      if (r.alphaReport) {
        logger.info(`     Thesis: ${r.alphaReport.narrative.slice(0, 100)}`);
      }
    }

    logger.info('═'.repeat(70));
  }

  private emptySummary(startTime: number): MasterScanSummary {
    return {
      totalScanned: 0, passedSmc: 0, passedForensic: 0, passedManipulation: 0,
      ultraGems: 0, strongBuys: 0, results: [],
      optimizationApplied: false, scanDurationMs: Date.now() - startTime, timestamp: Date.now(),
    };
  }

  private configSummary(): Record<string, unknown> {
    return {
      smc: this.config.enableSmc,
      forensics: this.config.enableForensics,
      narrative: this.config.enableNarrative,
      antiManipulation: this.config.enableAntiManipulation,
      autoOptimization: this.config.enableAutoOptimization,
      agentic: this.config.enableAgentic,
      smcTimeframes: this.config.smcTimeframes,
    };
  }

  getAdapters(): IDataProvider[] { return [...this.adapters]; }

  async shutdown(): Promise<void> {
    await this.ingestor.shutdown();
    logger.info('Master Scanner Engine shut down');
  }
}
