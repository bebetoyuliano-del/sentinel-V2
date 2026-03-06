import crypto from 'crypto';
import { rangeFilterPineExact, OHLCV } from './range_filter_pine';

export interface DriftSnapshot {
  timestamp: number;
  hash_filt: string;
  hash_smrn: string;
  avg_filt: number;
  avg_smrn: number;
}

export interface DriftStatus {
  is_healthy: boolean;
  last_check: number;
  filt_delta: number;
  smrn_delta: number;
  hash_changed: boolean;
  baseline_timestamp: number;
}

let baselineSnapshot: DriftSnapshot | null = null;
let baselineOhlcv: OHLCV[] | null = null;
let lastStatus: DriftStatus | null = null;

export function initBaseline(ohlcv: OHLCV[]) {
  // Take last 200 bars as baseline
  const windowSize = 200;
  const startIdx = Math.max(0, ohlcv.length - windowSize);
  baselineOhlcv = ohlcv.slice(startIdx);
  baselineSnapshot = calculateSnapshot(baselineOhlcv);
  
  lastStatus = {
    is_healthy: true,
    last_check: Date.now(),
    filt_delta: 0,
    smrn_delta: 0,
    hash_changed: false,
    baseline_timestamp: baselineSnapshot.timestamp
  };
  
  console.log(`RF Drift Monitor: Baseline initialized with ${baselineOhlcv.length} bars.`);
}

export function calculateSnapshot(ohlcv: OHLCV[]): DriftSnapshot {
  const result = rangeFilterPineExact(ohlcv);
  const filt = result.arrays.filt;
  const smrn = result.arrays.smoothrng;
  
  const round = (v: number | null, p: number) => v === null ? 'na' : v.toFixed(p);
  
  const filtStr = filt.map(v => round(v, 10)).join(',');
  const smrnStr = smrn.map(v => round(v, 10)).join(',');
  
  const hash_filt = crypto.createHash('sha256').update(filtStr).digest('hex');
  const hash_smrn = crypto.createHash('sha256').update(smrnStr).digest('hex');
  
  const avg = (arr: (number | null)[]) => {
    const valid = arr.filter(v => v !== null) as number[];
    return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
  };
  
  return {
    timestamp: Date.now(),
    hash_filt,
    hash_smrn,
    avg_filt: avg(filt),
    avg_smrn: avg(smrn)
  };
}

export function checkDrift(epsilon = 1e-8): DriftStatus {
  if (!baselineSnapshot || !baselineOhlcv) {
    throw new Error('Baseline not initialized');
  }

  const currentSnapshot = calculateSnapshot(baselineOhlcv);
  
  const filt_delta = Math.abs(currentSnapshot.avg_filt - baselineSnapshot.avg_filt);
  const smrn_delta = Math.abs(currentSnapshot.avg_smrn - baselineSnapshot.avg_smrn);
  const hash_changed = currentSnapshot.hash_filt !== baselineSnapshot.hash_filt || 
                       currentSnapshot.hash_smrn !== baselineSnapshot.hash_smrn;
  
  const is_healthy = filt_delta <= epsilon && smrn_delta <= epsilon && !hash_changed;
  
  lastStatus = {
    is_healthy,
    last_check: Date.now(),
    filt_delta,
    smrn_delta,
    hash_changed,
    baseline_timestamp: baselineSnapshot.timestamp
  };
  
  return lastStatus;
}

export function getStatus(): DriftStatus | null {
  return lastStatus;
}

export function generateDriftDump(ohlcv: OHLCV[]): string {
  const result = rangeFilterPineExact(ohlcv);
  const last50 = ohlcv.slice(-50);
  const last50Result = {
    filt: result.arrays.filt.slice(-50),
    smrn: result.arrays.smoothrng.slice(-50),
    hband: result.arrays.hband.slice(-50),
    lband: result.arrays.lband.slice(-50)
  };

  let csv = 'time,close,filt,smoothrng,hband,lband\n';
  for (let i = 0; i < last50.length; i++) {
    csv += `${new Date(last50[i][0]).toISOString()},${last50[i][4]},${last50Result.filt[i]},${last50Result.smrn[i]},${last50Result.hband[i]},${last50Result.lband[i]}\n`;
  }
  return csv;
}
