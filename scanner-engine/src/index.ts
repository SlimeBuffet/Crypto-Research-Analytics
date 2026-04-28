import * as dotenv from 'dotenv';
dotenv.config();

import { ScannerEngine } from './core/scanner-engine';
import { HedgeFundEngine } from './core/hedge-fund-engine';
import { logger } from './utils/logger';

const mode = process.env.ENGINE_MODE || 'scanner';

async function main(): Promise<void> {
  if (mode === 'hedge-fund') {
    await runHedgeFund();
  } else {
    await runScanner();
  }
}

async function runScanner(): Promise<void> {
  logger.info('Crypto Scanner Engine v1.0.0 starting...');

  const engine = new ScannerEngine();
  const results = await engine.scan();

  logger.info(`\n=== TOP ALPHA COINS (${results.length} total) ===\n`);

  const top = results.slice(0, 20);
  for (const coin of top) {
    const sectors = coin.categories.length > 0 ? coin.categories.slice(0, 3).join(', ') : coin.sector;
    logger.info(
      {
        rank: top.indexOf(coin) + 1,
        symbol: coin.symbol,
        alphaScore: coin.alphaScore,
        price: `$${coin.price.toFixed(4)}`,
        marketCap: formatUsd(coin.marketCap),
        fdvMcRatio: coin.fdvMcRatio.toFixed(2),
        volume24h: formatUsd(coin.volume24h),
        dexLiquidity: coin.dexLiquidity ? formatUsd(coin.dexLiquidity) : 'N/A',
        sector: sectors,
        sources: coin.dataSources.join(', '),
        breakdown: coin.scoreBreakdown,
      },
      `#${top.indexOf(coin) + 1} ${coin.symbol}`,
    );
  }

  logger.info('Scanner engine finished successfully');
}

async function runHedgeFund(): Promise<void> {
  logger.info('Hedge Fund Intelligence & Execution Engine v1.0.0 starting...');

  const engine = new HedgeFundEngine();
  const signals = await engine.execute();

  logger.info(`\n=== HEDGE FUND SIGNALS (${signals.length} total) ===\n`);

  for (const signal of signals) {
    logger.info(
      {
        symbol: signal.coin.symbol,
        name: signal.coin.name,
        verdict: signal.finalVerdict,
        compositeScore: signal.compositeScore.toFixed(1),
        positionSize: `${signal.positionSizePct.toFixed(2)}%`,
        price: `$${signal.coin.price.toFixed(4)}`,
        marketCap: formatUsd(signal.coin.marketCap),
        trigger: {
          highLine: signal.trigger.highLine.toFixed(4),
          priceAboveHigh: `${signal.trigger.priceAboveHighPct.toFixed(2)}%`,
        },
        alpha: {
          total: signal.alpha.totalAlphaScore.toFixed(1),
          value: signal.alpha.valueScore.toFixed(1),
          momentum: signal.alpha.momentumScore.toFixed(1),
          sentiment: signal.alpha.sentimentScore.toFixed(1),
          whale: signal.alpha.whaleInflowScore.toFixed(1),
        },
        risk: {
          score: signal.risk.totalRiskScore.toFixed(1),
          var24h: `${(signal.risk.valueAtRisk * 100).toFixed(1)}%`,
          securityScore: signal.risk.securityAudit.score,
          flags: signal.risk.securityAudit.flags,
        },
        execution: {
          strategy: signal.liquidity.recommendedStrategy,
          slippage: `${signal.liquidity.estimatedSlippage.toFixed(2)}%`,
          route: signal.liquidity.smartRoute.splitRatio,
        },
        macro: {
          signal: signal.macro.signal,
          dxyTrend: signal.macro.dxyTrend,
          riskMultiplier: signal.macro.riskMultiplier.toFixed(2),
        },
      },
      `${signal.finalVerdict} │ ${signal.coin.symbol} │ Score: ${signal.compositeScore.toFixed(1)}`,
    );
  }

  const summary = {
    strongBuy: signals.filter((s) => s.finalVerdict === 'STRONG_BUY').length,
    buy: signals.filter((s) => s.finalVerdict === 'BUY').length,
    watch: signals.filter((s) => s.finalVerdict === 'WATCH').length,
    macroSignal: signals[0]?.macro.signal || 'N/A',
  };
  logger.info(summary, 'Hedge Fund Engine finished');
}

function formatUsd(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

main().catch((err) => {
  logger.fatal({ err }, 'Engine crashed');
  process.exit(1);
});
