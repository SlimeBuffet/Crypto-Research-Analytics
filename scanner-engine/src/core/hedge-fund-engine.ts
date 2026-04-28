import { CoinData } from '../types';
import { HedgeFundSignal, HedgeFundConfig, PriceChannelResult } from '../types/hedge-fund';
import { ScannerEngine } from './scanner-engine';
import { PriceChannelTrigger } from '../trigger';
import {
  AlphaIntelligence,
  RiskEngine,
  LiquidityExecution,
  MacroOverlay,
} from '../pillars';
import { TtlCache } from '../utils/cache';
import { logger } from '../utils/logger';

/**
 * Hedge Fund Intelligence & Execution Engine.
 *
 * Workflow:
 * 1. Trigger Unit   — SMA High/Low (8,5) filters coins in "Institutional Inflow State"
 * 2. Intelligence    — Multi-Factor Alpha analysis (The Brain)
 * 3. Gatekeeper     — Risk & Security checks (The Shield)
 * 4. Macro Unit     — DXY & Rates overlay (The Compass)
 * 5. Execution Unit — VWAP/TWAP routing (The Sword)
 */
export class HedgeFundEngine {
  private config: HedgeFundConfig;
  private scanner: ScannerEngine;
  private trigger: PriceChannelTrigger;
  private alpha: AlphaIntelligence;
  private risk: RiskEngine;
  private liquidity: LiquidityExecution;
  private macro: MacroOverlay;
  private cache: TtlCache;

  constructor() {
    this.config = this.loadConfig();
    this.cache = new TtlCache(
      parseInt(process.env.CACHE_TTL_SECONDS || '21600', 10),
    );

    this.scanner = new ScannerEngine();
    this.trigger = new PriceChannelTrigger(
      this.config.smaHighPeriod,
      this.config.smaSmoothPeriod,
    );
    this.alpha = new AlphaIntelligence(this.cache);
    this.risk = new RiskEngine(
      this.cache,
      this.config.correlationThreshold,
      this.config.varConfidenceLevel,
    );
    this.liquidity = new LiquidityExecution(this.config.maxSlippagePct);
    this.macro = new MacroOverlay(this.cache, this.config.dxyBreakoutThreshold);
  }

  private loadConfig(): HedgeFundConfig {
    return {
      smaHighPeriod: parseInt(process.env.SMA_HIGH_PERIOD || '8', 10),
      smaLowPeriod: parseInt(process.env.SMA_LOW_PERIOD || '8', 10),
      smaSmoothPeriod: parseInt(process.env.SMA_SMOOTH_PERIOD || '5', 10),
      correlationThreshold: parseFloat(process.env.CORRELATION_THRESHOLD || '0.8'),
      maxSlippagePct: parseFloat(process.env.MAX_SLIPPAGE_PCT || '1.0'),
      varConfidenceLevel: parseFloat(process.env.VAR_CONFIDENCE || '0.95'),
      maxPositionSizePct: parseFloat(process.env.MAX_POSITION_SIZE_PCT || '5.0'),
      dxyBreakoutThreshold: parseFloat(process.env.DXY_BREAKOUT_THRESHOLD || '2.0'),
    };
  }

  /**
   * Execute the full Hedge Fund pipeline.
   * Returns actionable signals sorted by composite score.
   */
  async execute(): Promise<HedgeFundSignal[]> {
    const startTime = Date.now();
    logger.info('╔══════════════════════════════════════════════════════════╗');
    logger.info('║    HEDGE FUND INTELLIGENCE & EXECUTION ENGINE           ║');
    logger.info('╚══════════════════════════════════════════════════════════╝');

    // ──────────────────────────────────────────────────────────────
    // Phase 0: Base Scan — run the 4-stage scanner for raw coin data
    // ──────────────────────────────────────────────────────────────
    logger.info('▸ Phase 0: Running base scanner pipeline...');
    const coins = await this.scanner.scan();
    logger.info({ candidates: coins.length }, 'Base scan complete');

    if (coins.length === 0) {
      logger.warn('No coins from base scan — aborting');
      return [];
    }

    // ──────────────────────────────────────────────────────────────
    // Phase 1: Trigger Unit — SMA Price Channel Filter
    // ──────────────────────────────────────────────────────────────
    logger.info('▸ Phase 1: Trigger Unit — SMA Price Channel (8,5)');
    const symbols = coins.map((c) => c.symbol);
    const triggerResults = await this.trigger.filterInflow(symbols);

    const triggerMap = new Map<string, PriceChannelResult>();
    for (const t of triggerResults) {
      triggerMap.set(t.symbol, t);
    }

    const triggeredCoins = coins.filter((c) => triggerMap.has(c.symbol));
    logger.info(
      { total: coins.length, triggered: triggeredCoins.length },
      'Trigger filter: coins in Institutional Inflow State',
    );

    if (triggeredCoins.length === 0) {
      logger.info('No coins passed trigger — no institutional inflow detected');
      return [];
    }

    // ──────────────────────────────────────────────────────────────
    // Phase 2: Macro Unit — Global Macro Overlay (The Compass)
    // ──────────────────────────────────────────────────────────────
    logger.info('▸ Phase 2: Macro Unit — DXY & Fed Rates (The Compass)');
    const macroAnalysis = await this.macro.analyze();
    logger.info(
      {
        dxy: macroAnalysis.dxyLevel.toFixed(2),
        dxyTrend: macroAnalysis.dxyTrend,
        dxyBreakout: macroAnalysis.dxyBreakout,
        fedRate: macroAnalysis.fedRateLevel,
        signal: macroAnalysis.signal,
        riskMultiplier: macroAnalysis.riskMultiplier.toFixed(2),
      },
      'Macro analysis complete',
    );

    // ──────────────────────────────────────────────────────────────
    // Phase 3-5: Per-coin analysis (Intelligence → Gatekeeper → Execution)
    // ──────────────────────────────────────────────────────────────
    const signals: HedgeFundSignal[] = [];
    const approvedCoins: CoinData[] = [];

    for (const coin of triggeredCoins) {
      const triggerResult = triggerMap.get(coin.symbol);
      if (!triggerResult) continue;

      logger.info({ symbol: coin.symbol }, '── Analyzing coin ──');

      // Phase 3: Intelligence Unit — Pillar A (The Brain)
      logger.info('  ▸ Pillar A: Multi-Factor Alpha');
      const alphaResult = await this.alpha.analyze(coin);
      logger.info(
        { alpha: alphaResult.totalAlphaScore.toFixed(1) },
        `  Alpha score: ${alphaResult.totalAlphaScore.toFixed(1)}/100`,
      );

      // Phase 4: Gatekeeper Unit — Pillar B (The Shield)
      logger.info('  ▸ Pillar B: Quantitative Risk Engine');
      const riskResult = await this.risk.analyze(coin, approvedCoins);

      if (!riskResult.approved) {
        logger.warn(
          { symbol: coin.symbol, reason: riskResult.rejectReason },
          '  ✗ REJECTED by Gatekeeper',
        );
        continue;
      }
      logger.info(
        { riskScore: riskResult.totalRiskScore.toFixed(1) },
        '  Risk check: PASSED',
      );

      // Phase 5: Execution Unit — Pillar C (The Sword)
      logger.info('  ▸ Pillar C: Liquidity & Execution');
      const liquidityResult = await this.liquidity.analyze(coin);
      logger.info(
        {
          slippage: `${liquidityResult.estimatedSlippage.toFixed(2)}%`,
          strategy: liquidityResult.recommendedStrategy,
          route: liquidityResult.smartRoute.splitRatio,
        },
        '  Execution analysis complete',
      );

      // ── Composite Score & Verdict ──
      const compositeScore = this.calculateCompositeScore(
        alphaResult.totalAlphaScore,
        riskResult.totalRiskScore,
        liquidityResult.estimatedSlippage,
        macroAnalysis.riskMultiplier,
      );

      const finalVerdict = this.determineVerdict(
        compositeScore,
        riskResult.approved,
        liquidityResult.executable,
        macroAnalysis.signal,
      );

      const positionSizePct = this.calculatePositionSize(
        compositeScore,
        macroAnalysis.riskMultiplier,
        riskResult.valueAtRisk,
      );

      const signal: HedgeFundSignal = {
        coin,
        trigger: triggerResult,
        alpha: alphaResult,
        risk: riskResult,
        liquidity: liquidityResult,
        macro: macroAnalysis,
        finalVerdict,
        compositeScore,
        positionSizePct,
        timestamp: Date.now(),
      };

      signals.push(signal);
      approvedCoins.push(coin);

      logger.info(
        {
          symbol: coin.symbol,
          verdict: finalVerdict,
          composite: compositeScore.toFixed(1),
          position: `${positionSizePct.toFixed(2)}%`,
        },
        `  ═══ VERDICT: ${finalVerdict} ═══`,
      );
    }

    // Sort by composite score descending
    signals.sort((a, b) => b.compositeScore - a.compositeScore);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(
      {
        totalCoins: coins.length,
        triggered: triggeredCoins.length,
        approved: signals.length,
        strongBuy: signals.filter((s) => s.finalVerdict === 'STRONG_BUY').length,
        buy: signals.filter((s) => s.finalVerdict === 'BUY').length,
        watch: signals.filter((s) => s.finalVerdict === 'WATCH').length,
        elapsed: `${elapsed}s`,
      },
      '╔══════════════════════════════════════════════════════════╗',
    );
    logger.info('║              SCAN COMPLETE                               ║');
    logger.info('╚══════════════════════════════════════════════════════════╝');

    return signals;
  }

  /** Composite score combining all pillars (0-100) */
  private calculateCompositeScore(
    alphaScore: number,
    riskScore: number,
    slippage: number,
    macroMultiplier: number,
  ): number {
    const alphaComponent = alphaScore * 0.40;
    const riskComponent = (100 - riskScore) * 0.25;
    const executionComponent = Math.max(0, (5 - slippage) / 5) * 100 * 0.15;
    const macroComponent = macroMultiplier * 100 * 0.20;

    return Math.min(100, alphaComponent + riskComponent + executionComponent + macroComponent);
  }

  /** Determine final verdict based on composite score and conditions */
  private determineVerdict(
    compositeScore: number,
    riskApproved: boolean,
    executable: boolean,
    macroSignal: 'GREEN' | 'YELLOW' | 'RED',
  ): 'STRONG_BUY' | 'BUY' | 'WATCH' | 'REJECT' {
    if (!riskApproved) return 'REJECT';

    if (macroSignal === 'RED') {
      return compositeScore >= 75 ? 'WATCH' : 'REJECT';
    }

    if (compositeScore >= 75 && executable && macroSignal === 'GREEN') {
      return 'STRONG_BUY';
    }

    if (compositeScore >= 60 && executable) return 'BUY';
    if (compositeScore >= 40) return 'WATCH';

    return 'REJECT';
  }

  /** Calculate position size as % of portfolio */
  private calculatePositionSize(
    compositeScore: number,
    macroMultiplier: number,
    var24h: number,
  ): number {
    const baseSize = (compositeScore / 100) * this.config.maxPositionSizePct;
    const riskAdjusted = baseSize * macroMultiplier;

    // Reduce size for high-VaR assets
    const varPenalty = Math.min(var24h * 5, 0.5);
    const finalSize = Math.max(0.1, riskAdjusted * (1 - varPenalty));

    return Math.min(finalSize, this.config.maxPositionSizePct);
  }
}
