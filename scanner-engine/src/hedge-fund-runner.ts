import * as dotenv from 'dotenv';
dotenv.config();

import { HedgeFundEngine } from './hedge-fund';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  logger.info('Hedge Fund Intelligence & Execution Engine v1.0.0 starting...');

  const engine = new HedgeFundEngine({
    triggerConfig: {
      highPeriod: parseInt(process.env.TRIGGER_HIGH_PERIOD || '8', 10),
      lowPeriod: parseInt(process.env.TRIGGER_LOW_PERIOD || '8', 10),
      smaPeriod: parseInt(process.env.TRIGGER_SMA_PERIOD || '5', 10),
      offset: parseInt(process.env.TRIGGER_OFFSET || '0', 10),
    },
    maxCorrelation: parseFloat(process.env.MAX_CORRELATION || '0.8'),
    maxSlippagePct: parseFloat(process.env.MAX_SLIPPAGE_PCT || '1.0'),
    positionSizeUsd: parseFloat(process.env.POSITION_SIZE_USD || '100000'),
    maxOpenPositions: parseInt(process.env.MAX_OPEN_POSITIONS || '10', 10),
    executionType: (process.env.EXECUTION_TYPE || 'VWAP') as 'VWAP' | 'TWAP',
    executionSlices: parseInt(process.env.EXECUTION_SLICES || '10', 10),
    executionIntervalMs: parseInt(process.env.EXECUTION_INTERVAL_MS || '60000', 10),
    macroEnabled: process.env.MACRO_ENABLED !== 'false',
  });

  const summary = await engine.run();

  logger.info(
    {
      executionReady: summary.executionReady,
      totalScanned: summary.totalScanned,
      macroSignal: summary.macroState.signal,
    },
    'Pipeline finished',
  );

  if (summary.executionReady > 0) {
    logger.info('HIGH-ALPHA OPPORTUNITIES DETECTED:');
    for (const result of summary.results.filter((r) => r.finalVerdict === 'EXECUTE')) {
      logger.info(
        {
          symbol: result.symbol,
          alphaScore: result.alpha.totalAlphaScore,
          riskScore: result.risk.overallRiskScore,
          route: result.execution?.routingPlan.primaryExchange,
          strategy: result.execution?.executionStrategy.type,
          slices: result.execution?.executionStrategy.numSlices,
        },
        `EXECUTE: ${result.symbol}`,
      );
    }
  } else {
    logger.info('No high-alpha opportunities passed all gates at this time.');
  }
}

main().catch((err) => {
  logger.fatal({ err }, 'Hedge Fund Engine crashed');
  process.exit(1);
});
