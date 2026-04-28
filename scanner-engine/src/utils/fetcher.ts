import axios, { AxiosRequestConfig, AxiosError } from 'axios';
import pLimit from 'p-limit';
import { logger } from './logger';

const DEFAULT_CONCURRENCY = parseInt(process.env.CONCURRENCY_LIMIT || '5', 10);

/** Shared concurrency limiter */
export const limiter = pLimit(DEFAULT_CONCURRENCY);

interface FetchOptions extends AxiosRequestConfig {
  retries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  label?: string;
}

/**
 * Fetch with exponential backoff and concurrency control.
 * Automatically retries on 429 (rate limit) and 5xx errors.
 */
export async function fetchWithBackoff<T>(
  url: string,
  options: FetchOptions = {},
): Promise<T> {
  const {
    retries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30_000,
    label = url.slice(0, 80),
    ...axiosConfig
  } = options;

  return limiter(async () => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await axios({ url, ...axiosConfig });
        return response.data as T;
      } catch (err) {
        const error = err as AxiosError;
        const status = error.response?.status;
        lastError = error;

        const isRetryable =
          !status || status === 429 || status >= 500;

        // Provide clear error messages for common non-retryable failures
        if (status === 451) {
          logger.error(
            { label, status },
            'HTTP 451 Unavailable For Legal Reasons — endpoint is geo-restricted. ' +
            'Try using data-api.binance.vision instead of api.binance.com',
          );
          throw error;
        }

        if (!isRetryable || attempt === retries) {
          logger.error(
            { label, status, attempt, message: error.message },
            'Request failed (not retryable or max retries reached)',
          );
          throw error;
        }

        const delay = Math.min(
          initialDelayMs * Math.pow(2, attempt) + Math.random() * 500,
          maxDelayMs,
        );

        logger.warn(
          { label, status, attempt: attempt + 1, retries, delayMs: Math.round(delay) },
          'Retrying after backoff',
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError ?? new Error(`fetchWithBackoff failed for ${label}`);
  });
}
