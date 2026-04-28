import { logger } from '../../utils/logger';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
  name: string;
}

const DEFAULT_CB_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 60_000,
  halfOpenMaxAttempts: 2,
  name: 'unknown',
};

/**
 * Circuit Breaker for API adapters.
 *
 * Prevents cascading failures by tracking consecutive errors.
 * States:
 *   CLOSED    → Normal operation, requests pass through
 *   OPEN      → Too many failures, requests are immediately rejected
 *   HALF_OPEN → After reset timeout, allow a limited number of test requests
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private lastFailureTime = 0;
  private halfOpenAttempts = 0;
  private config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CB_CONFIG, ...config };
  }

  /**
   * Execute a function through the circuit breaker.
   * Throws CircuitOpenError if the circuit is open.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.config.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        this.halfOpenAttempts = 0;
        logger.info({ name: this.config.name }, 'Circuit breaker → HALF_OPEN');
      } else {
        throw new CircuitOpenError(
          `Circuit breaker [${this.config.name}] is OPEN. ` +
          `Retry after ${Math.ceil((this.config.resetTimeoutMs - (Date.now() - this.lastFailureTime)) / 1000)}s`,
        );
      }
    }

    if (this.state === 'HALF_OPEN' && this.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
      this.trip();
      throw new CircuitOpenError(`Circuit breaker [${this.config.name}] re-tripped during HALF_OPEN`);
    }

    try {
      if (this.state === 'HALF_OPEN') {
        this.halfOpenAttempts++;
      }

      const result = await fn();

      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      logger.info({ name: this.config.name }, 'Circuit breaker → CLOSED (recovered)');
    }
    this.failures = 0;
    this.state = 'CLOSED';
    this.halfOpenAttempts = 0;
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.config.failureThreshold) {
      this.trip();
    }
  }

  private trip(): void {
    this.state = 'OPEN';
    logger.warn(
      { name: this.config.name, failures: this.failures },
      'Circuit breaker → OPEN',
    );
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.halfOpenAttempts = 0;
  }
}

export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}
