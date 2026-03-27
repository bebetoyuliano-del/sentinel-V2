import { Ohlcv } from '../types/decisionCard';

export function atr14Last(ohlcv: Ohlcv[]): number | null {
  const n = 14;
  if (!ohlcv || ohlcv.length < n + 1) return null;
  const highs = ohlcv.map(c => c[2]);
  const lows  = ohlcv.map(c => c[3]);
  const closes= ohlcv.map(c => c[4]);

  const tr: number[] = [0];
  for (let i = 1; i < ohlcv.length; i++) {
    const h = highs[i], l = lows[i], pc = closes[i - 1];
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  let atr = tr[1];
  for (let i = 2; i <= n; i++) atr = (atr * (n - 1) + tr[i]) / n;
  for (let i = n + 1; i < tr.length; i++) atr = (atr * (n - 1) + tr[i]) / n;
  return atr || null;
}

export function deriveVolatilityRegime(atrPct: number | null | undefined) {
  if (atrPct == null) return '';
  if (atrPct < 1.0)  return 'LOW';
  if (atrPct <= 2.5) return 'NORMAL';
  return 'HIGH';
}

export function compute_bep_2to1(qtyLong: number, entryLong: number, qtyShort: number, entryShort: number): number | null {
  const diff = qtyLong - qtyShort;
  if (diff === 0) return null;
  return ((qtyLong * entryLong) - (qtyShort * entryShort)) / diff;
}
