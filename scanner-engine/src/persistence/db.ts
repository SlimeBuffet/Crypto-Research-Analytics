import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { logger } from '../utils/logger';

let db: BetterSQLite3Database<typeof schema> | null = null;
let rawSqlite: Database.Database | null = null;

/**
 * Get or create the singleton Drizzle ORM database connection.
 * Database file defaults to `./data/scanner.db` (configurable via DB_PATH).
 */
export function getDb(): BetterSQLite3Database<typeof schema> {
  if (db) return db;

  const dbPath = process.env.DB_PATH || './data/scanner.db';

  rawSqlite = new Database(dbPath);
  rawSqlite.pragma('journal_mode = WAL');
  rawSqlite.pragma('busy_timeout = 5000');

  db = drizzle(rawSqlite, { schema });

  initSchema(rawSqlite);

  logger.info({ path: dbPath }, 'SQLite database initialized');
  return db;
}

/**
 * Create tables if they don't exist.
 * Uses raw SQL so we don't need drizzle-kit for simple bootstrapping.
 */
function initSchema(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS scan_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      market_cap REAL NOT NULL,
      volume_24h REAL NOT NULL,
      fdv_mc_ratio REAL NOT NULL,
      price_change_24h REAL NOT NULL,
      price_change_7d REAL NOT NULL,
      price_change_30d REAL NOT NULL,
      alpha_score REAL NOT NULL,
      liquidity_score REAL NOT NULL,
      tokenomics_score REAL NOT NULL,
      market_cap_score REAL NOT NULL,
      momentum_score REAL NOT NULL,
      on_chain_score REAL NOT NULL,
      sector TEXT NOT NULL,
      scanned_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_scan_results_symbol ON scan_results(symbol);
    CREATE INDEX IF NOT EXISTS idx_scan_results_scanned_at ON scan_results(scanned_at);
    CREATE INDEX IF NOT EXISTS idx_scan_results_scan_id ON scan_results(scan_id);

    CREATE TABLE IF NOT EXISTS score_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      alpha_score REAL NOT NULL,
      price REAL NOT NULL,
      volume_24h REAL NOT NULL,
      recorded_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_score_history_symbol ON score_history(symbol);
    CREATE INDEX IF NOT EXISTS idx_score_history_recorded_at ON score_history(recorded_at);
  `);
}

/**
 * Close the database connection. Useful for graceful shutdown.
 */
export function closeDb(): void {
  if (rawSqlite) {
    rawSqlite.close();
    rawSqlite = null;
  }
  db = null;
}
