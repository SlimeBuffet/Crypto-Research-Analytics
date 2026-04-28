import * as dotenv from 'dotenv';
dotenv.config();

import { ScannerEngine } from './core/scanner-engine';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  logger.info('Crypto Scanner Engine v1.0.0 starting...');

  const engine = new ScannerEngine();
  const results = await engine.scan();

  // Print top results
  logger.info(`\n=== TOP ALPHA COINS (${results.length} total) ===\n`);

  const top = results.slice(0, 20);
  for (const coin of top) {
    const cats = Array.isArray(coin.categories) ? coin.categories : [];
    const sectors = cats.length > 0 ? cats.slice(0, 3).join(', ') : coin.sector;
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

function formatUsd(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

main().catch((err) => {
  logger.fatal({ err }, 'Scanner engine crashed');
  process.exit(1);
});
