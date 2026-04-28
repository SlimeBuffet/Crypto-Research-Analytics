/**
 * Piscina Worker Thread for CPU-intensive analysis tasks.
 *
 * Reference: piscinajs/piscina
 *
 * This worker handles:
 *   - SMC pattern detection on raw OHLC data
 *   - Volume profile calculation
 *   - Statistical analysis (Benford's law, correlation)
 *
 * Each task receives a WorkerTaskPayload and returns the computed result.
 */

interface WorkerPayload {
  type: 'smc_analysis' | 'forensic_audit' | 'manipulation_check' | 'narrative_map';
  symbol: string;
  data: unknown;
}

interface OHLCData {
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  volumes: number[];
}

/**
 * Main worker function — Piscina calls this for each task.
 */
export default function workerHandler(payload: WorkerPayload): unknown {
  switch (payload.type) {
    case 'smc_analysis':
      return processSmcAnalysis(payload.symbol, payload.data as OHLCData);
    case 'manipulation_check':
      return processManipulationCheck(payload.symbol, payload.data as { volumes: number[] });
    default:
      return { symbol: payload.symbol, error: `Unknown task type: ${payload.type}` };
  }
}

function processSmcAnalysis(symbol: string, data: OHLCData): unknown {
  const n = data.closes.length;
  if (n < 10) return { symbol, orderBlocks: [], fvgs: [], swingHighs: [], swingLows: [] };

  const opens = new Float64Array(data.opens);
  const highs = new Float64Array(data.highs);
  const lows = new Float64Array(data.lows);
  const closes = new Float64Array(data.closes);

  // Vectorized swing detection
  const swingHighs: number[] = [];
  const swingLows: number[] = [];
  const lookback = 5;

  for (let i = lookback; i < n - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (highs[i] <= highs[i - j] || highs[i] <= highs[i + j]) isHigh = false;
      if (lows[i] >= lows[i - j] || lows[i] >= lows[i + j]) isLow = false;
    }
    if (isHigh) swingHighs.push(i);
    if (isLow) swingLows.push(i);
  }

  // Vectorized OB detection
  const orderBlocks: Array<{ type: string; index: number; high: number; low: number }> = [];
  let avgBody = 0;
  for (let i = 0; i < n; i++) avgBody += Math.abs(closes[i] - opens[i]);
  avgBody /= n;

  for (let i = 2; i < n - 1; i++) {
    const currBull = closes[i] > opens[i];
    const prevBear = closes[i - 1] < opens[i - 1];
    const currBear = closes[i] < opens[i];
    const prevBull = closes[i - 1] > opens[i - 1];
    const bodySize = Math.abs(closes[i] - opens[i]);

    if (prevBear && currBull && bodySize > avgBody * 1.5) {
      orderBlocks.push({ type: 'BULLISH_OB', index: i - 1, high: highs[i - 1], low: lows[i - 1] });
    }
    if (prevBull && currBear && bodySize > avgBody * 1.5) {
      orderBlocks.push({ type: 'BEARISH_OB', index: i - 1, high: highs[i - 1], low: lows[i - 1] });
    }
  }

  // Vectorized FVG detection
  const fvgs: Array<{ type: string; index: number; high: number; low: number }> = [];
  for (let i = 2; i < n; i++) {
    if (highs[i - 2] < lows[i]) {
      fvgs.push({ type: 'BULLISH_FVG', index: i, high: lows[i], low: highs[i - 2] });
    }
    if (highs[i] < lows[i - 2]) {
      fvgs.push({ type: 'BEARISH_FVG', index: i, high: lows[i - 2], low: highs[i] });
    }
  }

  return { symbol, swingHighs, swingLows, orderBlocks, fvgs };
}

function processManipulationCheck(
  symbol: string, data: { volumes: number[] },
): unknown {
  const volumes = data.volumes;
  if (volumes.length < 10) return { symbol, benfordsChiSquared: 0, isSuspicious: false };

  // Benford's Law test
  const digitCounts = new Array(9).fill(0);
  const expected = [0.301, 0.176, 0.125, 0.097, 0.079, 0.067, 0.058, 0.051, 0.046];

  for (const v of volumes) {
    if (v <= 0) continue;
    const d = parseInt(v.toExponential().charAt(0), 10);
    if (d >= 1 && d <= 9) digitCounts[d - 1]++;
  }

  const n = volumes.filter((v) => v > 0).length;
  let chiSq = 0;
  for (let i = 0; i < 9; i++) {
    const e = expected[i] * n;
    if (e > 0) chiSq += Math.pow(digitCounts[i] - e, 2) / e;
  }

  return { symbol, benfordsChiSquared: chiSq, isSuspicious: chiSq > 15.51 };
}
