export type OHLCV = [number, number, number, number, number, number];

export function mapTfToMs(tf: string): number {
  const unit = tf.slice(-1).toLowerCase();
  const val = parseInt(tf.slice(0, -1)) || 1;
  switch (unit) {
    case 'm': return val * 60 * 1000;
    case 'h': return val * 60 * 60 * 1000;
    case 'd': return val * 24 * 60 * 60 * 1000;
    case 'w': return val * 7 * 24 * 60 * 60 * 1000;
    default: return val * 60 * 1000;
  }
}

export function isBarClosed(lastTs: number, tfMs: number, nowMs: number): boolean {
  // A bar is closed if the current time is greater than or equal to the bar's open time + timeframe duration
  return nowMs >= lastTs + tfMs;
}

export function stripUnclosed(ohlcv: OHLCV[], tfMs: number, nowMs: number = Date.now()): {
  strippedOhlcv: OHLCV[],
  barClosed: boolean,
  droppedLast: boolean,
  lastBarTs: number | null
} {
  if (ohlcv.length === 0) {
    return { strippedOhlcv: [], barClosed: true, droppedLast: false, lastBarTs: null };
  }
  
  const lastBarTs = ohlcv[ohlcv.length - 1][0];
  const barClosed = isBarClosed(lastBarTs, tfMs, nowMs);
  
  if (!barClosed) {
    return {
      strippedOhlcv: ohlcv.slice(0, -1),
      barClosed: false,
      droppedLast: true,
      lastBarTs
    };
  }
  
  return {
    strippedOhlcv: ohlcv,
    barClosed: true,
    droppedLast: false,
    lastBarTs
  };
}

export function runTfAlignmentUnitTest() {
  const nowMs = 1700000000000; // Arbitrary timestamp
  
  // Test 5m
  const tf5mMs = mapTfToMs('5m');
  if (tf5mMs !== 300000) throw new Error(`5m should be 300000 ms, got ${tf5mMs}`);
  
  const ohlcv5m: OHLCV[] = [
    [nowMs - 600000, 1, 2, 1, 2, 100], // Closed (10m ago)
    [nowMs - 300000, 2, 3, 2, 3, 100], // Closed (5m ago)
    [nowMs - 100000, 3, 4, 3, 4, 100]  // Unclosed (100s ago)
  ];
  
  const res5m = stripUnclosed(ohlcv5m, tf5mMs, nowMs);
  if (!res5m.droppedLast) throw new Error('5m should drop last unclosed bar');
  if (res5m.strippedOhlcv.length !== 2) throw new Error('5m should have 2 bars left');
  if (res5m.barClosed) throw new Error('5m last bar should be unclosed');
  
  // Test 4h
  const tf4hMs = mapTfToMs('4h');
  if (tf4hMs !== 14400000) throw new Error(`4h should be 14400000 ms, got ${tf4hMs}`);
  
  const ohlcv4h: OHLCV[] = [
    [nowMs - 20000000, 1, 2, 1, 2, 100], // Closed
    [nowMs - 15000000, 2, 3, 2, 3, 100]  // Closed
  ];
  
  const res4h = stripUnclosed(ohlcv4h, tf4hMs, nowMs);
  if (res4h.droppedLast) throw new Error('4h should not drop closed bar');
  if (res4h.strippedOhlcv.length !== 2) throw new Error('4h should have 2 bars left');
  if (!res4h.barClosed) throw new Error('4h last bar should be closed');
  
  console.log('TF Alignment Unit Tests Passed');
}
