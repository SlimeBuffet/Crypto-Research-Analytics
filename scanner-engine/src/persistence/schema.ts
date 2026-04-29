import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

/**
 * Scan results table — stores every scored coin per scan run.
 * Enables time-series queries like:
 *   "Has this coin's score been rising or falling over the last 3 hours?"
 */
export const scanResults = sqliteTable('scan_results', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').notNull(),
  symbol: text('symbol').notNull(),
  name: text('name').notNull(),
  price: real('price').notNull(),
  marketCap: real('market_cap').notNull(),
  volume24h: real('volume_24h').notNull(),
  fdvMcRatio: real('fdv_mc_ratio').notNull(),
  priceChange24h: real('price_change_24h').notNull(),
  priceChange7d: real('price_change_7d').notNull(),
  priceChange30d: real('price_change_30d').notNull(),
  alphaScore: real('alpha_score').notNull(),
  liquidityScore: real('liquidity_score').notNull(),
  tokenomicsScore: real('tokenomics_score').notNull(),
  marketCapScore: real('market_cap_score').notNull(),
  momentumScore: real('momentum_score').notNull(),
  onChainScore: real('on_chain_score').notNull(),
  sector: text('sector').notNull(),
  scannedAt: integer('scanned_at', { mode: 'timestamp' }).notNull(),
});

/**
 * Score history — lightweight time-series of just symbol + score + timestamp.
 * Optimized for trend queries.
 */
export const scoreHistory = sqliteTable('score_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  symbol: text('symbol').notNull(),
  alphaScore: real('alpha_score').notNull(),
  price: real('price').notNull(),
  volume24h: real('volume_24h').notNull(),
  recordedAt: integer('recorded_at', { mode: 'timestamp' }).notNull(),
});
