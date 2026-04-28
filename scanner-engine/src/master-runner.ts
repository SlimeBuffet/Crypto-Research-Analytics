import * as dotenv from 'dotenv';
dotenv.config();

import { MasterScannerEngine } from './master';
import { logger } from './utils/logger';

/**
 * Master Scanner Engine Runner
 *
 * Entry point for the Master Level intelligence pipeline.
 * Runs the full "Sentient Pipeline":
 *   Layer 1: Ingest (WebSocket streams)
 *   Layer 2: Analyze (SMC pattern brain)
 *   Layer 3: Audit (Forensic shield)
 *   Layer 4: Narrate (Agentic orchestrator)
 */
async function main(): Promise<void> {
  logger.info('');
  logger.info('╔══════════════════════════════════════════════════════════════╗');
  logger.info('║     MASTER SCANNER ENGINE v1.0.0 — Autonomous Alpha        ║');
  logger.info('╚══════════════════════════════════════════════════════════════╝');
  logger.info('');

  const engine = new MasterScannerEngine();

  try {
    const summary = await engine.runIntelligenceSuite();

    // Print final summary
    logger.info('');
    logger.info('━━━ FINAL SUMMARY ━━━');
    logger.info(`Total Scanned:        ${summary.totalScanned}`);
    logger.info(`Passed SMC:           ${summary.passedSmc}`);
    logger.info(`Passed Forensic:      ${summary.passedForensic}`);
    logger.info(`Passed Anti-Manip:    ${summary.passedManipulation}`);
    logger.info(`Ultra Gems Found:     ${summary.ultraGems}`);
    logger.info(`Strong Buys:          ${summary.strongBuys}`);
    logger.info(`Optimization Applied: ${summary.optimizationApplied}`);
    logger.info(`Duration:             ${(summary.scanDurationMs / 1000).toFixed(1)}s`);

    // Print top 5 results with narratives
    const top5 = summary.results.slice(0, 5);
    if (top5.length > 0) {
      logger.info('');
      logger.info('━━━ TOP ALPHA PICKS ━━━');
      for (let i = 0; i < top5.length; i++) {
        const r = top5[i];
        logger.info(`#${i + 1} ${r.symbol} [${r.finalVerdict}]`);
        logger.info(`   Master Score: ${r.dynamicScore.finalScore.toFixed(2)}`);
        logger.info(`   Formula: ${r.dynamicScore.formula}`);

        if (r.alphaReport) {
          logger.info(`   Confidence: ${(r.alphaReport.confidence * 100).toFixed(0)}%`);
          if (r.alphaReport.catalysts.length > 0) {
            logger.info(`   Catalysts: ${r.alphaReport.catalysts.slice(0, 3).join('; ')}`);
          }
          if (r.alphaReport.risks.length > 0) {
            logger.info(`   Risks: ${r.alphaReport.risks.slice(0, 2).join('; ')}`);
          }
        }
        logger.info('');
      }
    }

    logger.info('Master Scanner Engine finished successfully');
  } catch (err) {
    const error = err as Error;
    logger.fatal({ err: error.message }, 'Master Scanner Engine crashed');
    process.exit(1);
  } finally {
    await engine.shutdown();
  }
}

main().catch((err) => {
  logger.fatal({ err }, 'Master runner crashed');
  process.exit(1);
});
