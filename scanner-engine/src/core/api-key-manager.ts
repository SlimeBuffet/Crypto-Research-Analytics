import { ApiService } from '../types';
import { logger, maskKey } from '../utils/logger';

interface KeyState {
  key: string;
  useCount: number;
  lastUsed: number;
  failCount: number;
  cooldownUntil: number;
}

/**
 * Manages API key rotation across multiple services.
 * Supports round-robin and least-used strategies.
 * Automatically loads numbered keys from environment variables
 * (e.g. ALCHEMY_KEY_1, ALCHEMY_KEY_2, ...).
 */
export class ApiKeyManager {
  private keys = new Map<ApiService, KeyState[]>();
  private roundRobinIndex = new Map<ApiService, number>();

  constructor() {
    this.loadKeysFromEnv();
  }

  private loadKeysFromEnv(): void {
    const serviceEnvMap: Record<ApiService, string> = {
      alchemy: 'ALCHEMY_KEY',
      quicknode_http_bsc: 'QUICKNODE_HTTP_BSC',
      quicknode_http_eth: 'QUICKNODE_HTTP_ETH',
      quicknode_http_worldchain: 'QUICKNODE_HTTP_WORLDCHAIN',
      quicknode_wss: 'QUICKNODE_WSS',
      cryptorank: 'CRYPTORANK_API_KEY',
      mobula: 'MOBULA_API_KEY',
      coincap: 'COINCAP_API_KEY',
    };

    for (const [service, prefix] of Object.entries(serviceEnvMap)) {
      const keys: KeyState[] = [];

      for (let i = 1; i <= 10; i++) {
        const envKey = `${prefix}_${i}`;
        const value = process.env[envKey];
        if (value && !value.startsWith('your_') && !value.includes('your_') && !value.includes('your-')) {
          keys.push({
            key: value,
            useCount: 0,
            lastUsed: 0,
            failCount: 0,
            cooldownUntil: 0,
          });
        }
      }

      if (keys.length > 0) {
        this.keys.set(service as ApiService, keys);
        this.roundRobinIndex.set(service as ApiService, 0);
        logger.info(
          { service, count: keys.length, keys: keys.map((k) => maskKey(k.key)) },
          'Loaded API keys',
        );
      }
    }
  }

  /** Get the next available key using round-robin strategy */
  getKey(service: ApiService): string | null {
    const states = this.keys.get(service);
    if (!states || states.length === 0) return null;

    const now = Date.now();
    const startIdx = this.roundRobinIndex.get(service) ?? 0;

    for (let attempt = 0; attempt < states.length; attempt++) {
      const idx = (startIdx + attempt) % states.length;
      const state = states[idx];

      if (now < state.cooldownUntil) continue;

      state.useCount++;
      state.lastUsed = now;
      this.roundRobinIndex.set(service, (idx + 1) % states.length);

      logger.debug(
        { service, keyIndex: idx, masked: maskKey(state.key), useCount: state.useCount },
        'Key selected',
      );
      return state.key;
    }

    logger.warn({ service }, 'All keys are on cooldown');
    return states[startIdx % states.length].key;
  }

  /** Get the least-used key */
  getLeastUsedKey(service: ApiService): string | null {
    const states = this.keys.get(service);
    if (!states || states.length === 0) return null;

    const now = Date.now();
    const available = states.filter((s) => now >= s.cooldownUntil);
    if (available.length === 0) return this.getKey(service);

    available.sort((a, b) => a.useCount - b.useCount);
    const chosen = available[0];
    chosen.useCount++;
    chosen.lastUsed = now;
    return chosen.key;
  }

  /** Report a failure for rate-limit handling */
  reportFailure(service: ApiService, key: string, cooldownMs = 60_000): void {
    const states = this.keys.get(service);
    if (!states) return;

    const state = states.find((s) => s.key === key);
    if (state) {
      state.failCount++;
      state.cooldownUntil = Date.now() + cooldownMs;
      logger.warn(
        { service, masked: maskKey(key), failCount: state.failCount, cooldownMs },
        'Key placed on cooldown',
      );
    }
  }

  /** Check if a service has any keys configured */
  hasKeys(service: ApiService): boolean {
    const states = this.keys.get(service);
    return !!states && states.length > 0;
  }

  /** Get stats for all services */
  getStats(): Record<string, { total: number; available: number; totalUses: number }> {
    const stats: Record<string, { total: number; available: number; totalUses: number }> = {};
    const now = Date.now();

    for (const [service, states] of this.keys) {
      stats[service] = {
        total: states.length,
        available: states.filter((s) => now >= s.cooldownUntil).length,
        totalUses: states.reduce((sum, s) => sum + s.useCount, 0),
      };
    }
    return stats;
  }
}
