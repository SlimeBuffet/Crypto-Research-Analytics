import { CoinData } from '../../types';
import { ScannerEngine } from '../../core/scanner-engine';
import { RpcAdapter } from '../../adapters/rpc';
import { ApiKeyManager } from '../../core/api-key-manager';
import { logger } from '../../utils/logger';

import { PriceChannelTrigger } from '../trigger';
import { AlphaEngine, RiskEngine, ExecutionEngine, MacroEngine } from '../pillars';
import { OnChainAnalyticsEngine } from '../onchain';
import { MicrostructureEngine } from '../microstructure';
import { NarrativeEngine } from '../narrative';
import { AlertManager } from '../alerts';
import {
  HedgeFundConfig,
  PipelineResult,
  ScanSummary,
} from '../types';

const DEFAULT_CONFIG: HedgeFundConfig = {
  triggerConfig: {
    highPeriod: 8,
    lowPeriod: 8,
    smaPeriod: 5,
    offset: 0,
  },
  maxCorrelation: 0.8,
  maxSlippagePct: 1.0,
  positionSizeUsd: 100_000,
  maxOpenPositions: 10,
  executionType: 'VWAP',
  executionSlices: 10,
  executionIntervalMs: 60_000,
  macroEnabled: true,
};

/**
 * Hedge Fund Intelligence & Execution Engine.
 *
 * Workflow:
 *   1. Trigger Unit    — SMA High/Low (8,5) determines which coins to inspect
 *   2. Intelligence    — Multi-Factor Alpha (Pillar A) verifies the opportunity
 *   3. Gatekeeper      — Risk & Security (Pillar B) blocks scams / correlated assets
 *   4. Macro Unit      — DXY & Rates (Pillar D) gives green/yellow/red signal
 *   5. Execution Unit  — VWAP/TWAP (Pillar C) enters positions smoothly
 */
export class HedgeFundEngine {
  private config: HedgeFundConfig;
  private scanner: ScannerEngine;
  private trigger: PriceChannelTrigger;
  private alpha: AlphaEngine;
  private risk: RiskEngine;
  private execution: ExecutionEngine;
  private macro: MacroEngine;
  private onchain: OnChainAnalyticsEngine;
  private microstructure: MicrostructureEngine;
  private narrative: NarrativeEngine;
  private alertManager: AlertManager;
  private portfolio: CoinData[] = [];

  constructor(config?: Partial<HedgeFundConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.scanner = new ScannerEngine();
    this.trigger = new PriceChannelTrigger(this.config.triggerConfig);
    this.alpha = new AlphaEngine();

    const keyManager = new ApiKeyManager();
    const rpc = new RpcAdapter(keyManager);
    this.risk = new RiskEngine(rpc, this.config.maxCorrelation);

    this.execution = new ExecutionEngine(this.config.maxSlippagePct);
    this.macro = new MacroEngine();
    this.onchain = new OnChainAnalyticsEngine();
    this.microstructure = new MicrostructureEngine();
    this.narrative = new NarrativeEngine();
    this.alertManager = new AlertManager();
  }

  /**
   * Execute the full Hedge Fund Intelligence pipeline.
   */
  async run(): Promise<ScanSummary> {
    const startTime = Date.now();

    logger.info('='.repeat(60));
    logger.info('  HEDGE FUND INTELLIGENCE & EXECUTION ENGINE');
    logger.info('='.repeat(60));
    logger.info({ config: this.config }, 'Configuration');

    // ================================================================
    // Stage 0: Base scan — discover candidates via existing pipeline
    // ================================================================
    logger.info('--- Stage 0: Base Discovery (Scanner Engine) ---');
    const allCoins = await this.scanner.scan();
    logger.info({ candidates: allCoins.length }, 'Base scan complete');

    // ================================================================
    // Stage 1: Technical Trigger — SMA Price Channel Filter
    // ================================================================
    logger.info('--- Stage 1: Technical Trigger (Price Channel) ---');
    const symbols = allCoins.map((c) => c.symbol);
    const triggered = await this.trigger.scanBatch(symbols);
    const triggeredSymbols = new Set(triggered.map((t) => t.symbol));
    const triggeredCoins = allCoins.filter((c) => triggeredSymbols.has(c.symbol));

    logger.info(
      {
        total: allCoins.length,
        triggered: triggeredCoins.length,
        triggerRate: `${((triggeredCoins.length / allCoins.length) * 100).toFixed(1)}%`,
      },
      'Trigger filter complete',
    );

    if (triggeredCoins.length === 0) {
      logger.info('No coins passed the trigger filter. Pipeline ends.');
      const macroState = await this.macro.getState();
      return this.buildSummary([], macroState, allCoins.length, startTime);
    }

    // ================================================================
    // Stage 2: Pillar A — Multi-Factor Alpha
    // ================================================================
    logger.info('--- Stage 2: Pillar A — Multi-Factor Alpha ---');
    const alphaResults = await this.alpha.analyzeBatch(triggeredCoins);

    const alphaThreshold = 30;
    const alphaApproved = triggeredCoins.filter((c) => {
      const alpha = alphaResults.get(c.symbol);
      return alpha && alpha.totalAlphaScore >= alphaThreshold;
    });

    logger.info(
      {
        analyzed: alphaResults.size,
        approved: alphaApproved.length,
        threshold: alphaThreshold,
      },
      'Alpha verification complete',
    );

    // ================================================================
    // Stage 3: Pillar B — Quantitative Risk Engine
    // ================================================================
    logger.info('--- Stage 3: Pillar B — Risk & Security ---');
    const coinsForRisk = alphaApproved.length > 0 ? alphaApproved : triggeredCoins;
    const riskResults = await this.risk.assessBatch(coinsForRisk, this.portfolio);

    const riskApproved = coinsForRisk.filter((c) => {
      const risk = riskResults.get(c.symbol);
      return risk && risk.isApproved;
    });

    logger.info(
      {
        assessed: riskResults.size,
        approved: riskApproved.length,
        blocked: riskResults.size - riskApproved.length,
      },
      'Risk gatekeeper complete',
    );

    // ================================================================
    // Stage 4: Pillar D — Global Macro Overlay
    // ================================================================
    logger.info('--- Stage 4: Pillar D — Macro Overlay ---');
    const macroState = await this.macro.getState();

    let macroApproved = riskApproved;
    if (this.config.macroEnabled && macroState.signal === 'RED') {
      logger.info(
        { signal: macroState.signal, recommendation: macroState.recommendation },
        'Macro RED signal — reducing candidate pool',
      );
      macroApproved = riskApproved.slice(
        0,
        Math.max(1, Math.floor(riskApproved.length * macroState.riskMultiplier)),
      );
    }

    // ================================================================
    // Stage 4b: On-Chain Analytics
    // ================================================================
    logger.info('--- Stage 4b: On-Chain Analytics ---');
    const onchainResults = await this.onchain.analyzeBatch(macroApproved);

    // ================================================================
    // Stage 4c: Market Microstructure
    // ================================================================
    logger.info('--- Stage 4c: Market Microstructure ---');
    const microResults = await this.microstructure.analyzeBatch(macroApproved);

    // ================================================================
    // Stage 4d: Narrative / Catalyst Analysis
    // ================================================================
    logger.info('--- Stage 4d: Narrative / Catalyst Analysis ---');
    const narrativeResults = await this.narrative.analyzeBatch(macroApproved);

    // ================================================================
    // Stage 5: Pillar C — Execution Planning
    // ================================================================
    logger.info('--- Stage 5: Pillar C — Execution Planning ---');
    const adjustedPositionSize =
      this.config.positionSizeUsd * macroState.riskMultiplier;

    const executionPlans = await this.execution.planBatch(
      macroApproved,
      adjustedPositionSize,
      this.config.executionType,
      this.config.executionSlices,
      this.config.executionIntervalMs,
    );

    // ================================================================
    // Assemble pipeline results
    // ================================================================
    const triggerMap = new Map(triggered.map((t) => [t.symbol, t]));

    const results: PipelineResult[] = macroApproved
      .filter((c) => executionPlans.has(c.symbol))
      .map((coin) => {
        const alpha = alphaResults.get(coin.symbol)!;
        const risk = riskResults.get(coin.symbol)!;
        const exec = executionPlans.get(coin.symbol) ?? null;
        const trig = triggerMap.get(coin.symbol)!;

        let finalVerdict: 'EXECUTE' | 'HOLD' | 'REJECT' = 'EXECUTE';
        let rejectionReason: string | null = null;

        if (!risk.isApproved) {
          finalVerdict = 'REJECT';
          rejectionReason = `Risk gate failed: ${risk.securityAudit.riskFlags.join(', ')}`;
        } else if (macroState.signal === 'RED') {
          finalVerdict = 'HOLD';
          rejectionReason = 'Macro RED signal — holding for better conditions';
        } else if (exec && !exec.orderBookAnalysis.isLiquidEnough) {
          finalVerdict = 'HOLD';
          rejectionReason = `Slippage too high: ${exec.orderBookAnalysis.estimatedSlippage.toFixed(2)}%`;
        }

        const onchain = onchainResults.get(coin.symbol) ?? null;
        const micro = microResults.get(coin.symbol) ?? null;
        const narrative = narrativeResults.get(coin.symbol) ?? null;

        return {
          symbol: coin.symbol,
          coin,
          trigger: trig,
          alpha,
          risk,
          macro: macroState,
          execution: exec,
          onchain,
          microstructure: micro,
          narrative,
          finalVerdict,
          rejectionReason,
          timestamp: Date.now(),
        };
      });

    results.sort((a, b) => b.alpha.totalAlphaScore - a.alpha.totalAlphaScore);

    const summary = this.buildSummary(
      results,
      macroState,
      allCoins.length,
      startTime,
    );

    this.printSummary(summary);

    // Dispatch alerts for triggered coins
    for (const result of results.filter((r) => r.finalVerdict === 'EXECUTE')) {
      await this.alertManager.alertTriggerActivated(
        result.symbol,
        result.trigger.currentPrice,
        result.trigger.highLine,
      );
    }

    if (macroState.signal !== 'GREEN') {
      await this.alertManager.alertMacroSignalChange(
        macroState.signal,
        macroState.recommendation,
      );
    }

    return summary;
  }

  private buildSummary(
    results: PipelineResult[],
    macroState: import('../types').MacroState,
    totalScanned: number,
    startTime: number,
  ): ScanSummary {
    return {
      totalScanned,
      triggered: results.length,
      alphaApproved: results.filter((r) => r.alpha.totalAlphaScore >= 30).length,
      riskApproved: results.filter((r) => r.risk.isApproved).length,
      macroApproved: results.length,
      executionReady: results.filter((r) => r.finalVerdict === 'EXECUTE').length,
      results,
      macroState,
      timestamp: Date.now(),
      elapsedMs: Date.now() - startTime,
    };
  }

  private printSummary(summary: ScanSummary): void {
    logger.info('='.repeat(60));
    logger.info('  PIPELINE SUMMARY');
    logger.info('='.repeat(60));

    logger.info(
      {
        totalScanned: summary.totalScanned,
        triggered: summary.triggered,
        alphaApproved: summary.alphaApproved,
        riskApproved: summary.riskApproved,
        executionReady: summary.executionReady,
        macroSignal: summary.macroState.signal,
        elapsed: `${(summary.elapsedMs / 1000).toFixed(1)}s`,
      },
      'Funnel metrics',
    );

    for (const result of summary.results.slice(0, 10)) {
      const exec = result.execution;
      logger.info(
        {
          symbol: result.symbol,
          verdict: result.finalVerdict,
          alphaScore: result.alpha.totalAlphaScore,
          riskScore: result.risk.overallRiskScore,
          slippage: exec
            ? `${exec.orderBookAnalysis.estimatedSlippage.toFixed(2)}%`
            : 'N/A',
          routing: exec ? exec.routingPlan.primaryExchange : 'N/A',
          narrativeScore: result.narrative?.narrativeScore ?? 'N/A',
          fundingRate: result.microstructure?.fundingRate.currentRate ?? 'N/A',
          walletConc: result.onchain?.walletConcentration.giniCoefficient ?? 'N/A',
          reason: result.rejectionReason || 'CLEAR',
        },
        `${result.finalVerdict} ${result.symbol}`,
      );
    }
  }
}
