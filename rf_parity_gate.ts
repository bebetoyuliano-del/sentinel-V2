import fs from 'fs';
import { rangeFilterPineExact, OHLCV } from './range_filter_pine';

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

export function ensureBarClose(ohlcv: OHLCV[], tf: string): OHLCV[] {
  if (ohlcv.length === 0) return ohlcv;
  const tfMs = mapTfToMs(tf);
  const now = Date.now();
  const lastBarTime = ohlcv[ohlcv.length - 1][0];
  if (now < lastBarTime + tfMs) {
    return ohlcv.slice(0, -1);
  }
  return ohlcv;
}

function parseCSV(content: string): any[] {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length < headers.length) continue;
    const row: any = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j].trim();
    }
    data.push(row);
  }
  return data;
}

function runParityGate() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.log('Usage: npx tsx rf_parity_gate.ts <tv_csv_path> [epsilon]');
    console.log('Export CSV from TradingView (menu "Export chart data") while the indicator is active.');
    process.exit(1);
  }

  const epsilon = parseFloat(process.argv[3] || '1e-8');

  const content = fs.readFileSync(inputFile, 'utf-8');
  const rows = parseCSV(content);

  const ohlcv: OHLCV[] = rows.map(r => {
    let time = 0;
    if (r.time) {
      const t = new Date(r.time).getTime();
      if (!isNaN(t)) time = t;
      else time = parseInt(r.time);
    }
    return [
      time,
      parseFloat(r.open),
      parseFloat(r.high),
      parseFloat(r.low),
      parseFloat(r.close),
      parseFloat(r.Volume || r.volume || '0')
    ];
  });

  const validOhlcv = ohlcv.filter(c => !isNaN(c[1]) && !isNaN(c[4]));
  if (validOhlcv.length < 100) {
    console.error('Not enough data bars.');
    process.exit(1);
  }

  const params = { src: 'close' as const, per: 100, mult: 3.0 };
  const result = rangeFilterPineExact(validOhlcv, params);

  // Check if reference columns exist
  const firstRow = rows[0];
  let smoothrngCol = Object.keys(firstRow).find(k => k.toLowerCase().includes('smoothrng') || k.includes('Smoothed Range') || k.includes('smrng'));
  let filtCol = Object.keys(firstRow).find(k => k.toLowerCase().includes('filt') || k.includes('Range Filter'));

  let maxAbsDiffSmoothrng = 0;
  let maxAbsDiffFilt = 0;
  let firstMismatchIdx = -1;
  let signalMismatch = false;

  const checkWindow = Math.min(500, validOhlcv.length);
  const startIdx = validOhlcv.length - checkWindow;

  // Signal columns detection
  let longSigCol = Object.keys(firstRow).find(k => k.toLowerCase().includes('longcondition') || k.includes('Buy Signal'));
  let shortSigCol = Object.keys(firstRow).find(k => k.toLowerCase().includes('shortcondition') || k.includes('Sell Signal'));

  if (smoothrngCol && filtCol) {
    for (let i = startIdx; i < validOhlcv.length; i++) {
      const tvSmoothrng = parseFloat(rows[i][smoothrngCol]);
      const tvFilt = parseFloat(rows[i][filtCol]);
      
      const jsSmoothrng = result.arrays.smoothrng[i] || 0;
      const jsFilt = result.arrays.filt[i] || 0;

      const diffSmoothrng = Math.abs(jsSmoothrng - tvSmoothrng);
      const diffFilt = Math.abs(jsFilt - tvFilt);

      if (!isNaN(diffSmoothrng) && diffSmoothrng > maxAbsDiffSmoothrng) maxAbsDiffSmoothrng = diffSmoothrng;
      if (!isNaN(diffFilt) && diffFilt > maxAbsDiffFilt) maxAbsDiffFilt = diffFilt;

      if (firstMismatchIdx === -1 && (diffSmoothrng > epsilon || diffFilt > epsilon)) {
        firstMismatchIdx = i;
      }

      // Compare signals if available
      if (longSigCol && shortSigCol) {
        const tvLong = parseFloat(rows[i][longSigCol]) > 0;
        const tvShort = parseFloat(rows[i][shortSigCol]) > 0;
        const jsLong = result.arrays.longSignal[i];
        const jsShort = result.arrays.shortSignal[i];

        if (tvLong !== jsLong || tvShort !== jsShort) {
            if (firstMismatchIdx === -1) {
                firstMismatchIdx = i;
                signalMismatch = true;
            }
        }
      }
    }
  }

  if (firstMismatchIdx !== -1) {
    const i = firstMismatchIdx;
    const tvSmoothrng = smoothrngCol ? parseFloat(rows[i][smoothrngCol]) : null;
    const tvFilt = filtCol ? parseFloat(rows[i][filtCol]) : null;
    const tvLong = longSigCol ? parseFloat(rows[i][longSigCol]) : null;
    const tvShort = shortSigCol ? parseFloat(rows[i][shortSigCol]) : null;

    console.error('PARITY CHECK FAILED');
    console.error(JSON.stringify({
      i_star: i,
      time: rows[i].time,
      mismatch_type: signalMismatch ? 'SIGNAL' : 'NUMERIC',
      x_i: result.arrays.src[i],
      smoothrng_js: result.arrays.smoothrng[i],
      smoothrng_tv: tvSmoothrng,
      filt_js: result.arrays.filt[i],
      filt_tv: tvFilt,
      longSig_js: result.arrays.longSignal[i],
      longSig_tv: tvLong,
      shortSig_js: result.arrays.shortSignal[i],
      shortSig_tv: tvShort,
      CondIni_js: result.arrays.CondIni[i]
    }, null, 2));
    process.exit(1);
  } else {
    const last500Long = result.arrays.longSignal.slice(-500).filter(s => s).length;
    const last500Short = result.arrays.shortSignal.slice(-500).filter(s => s).length;

    console.log(JSON.stringify({
      nBars: validOhlcv.length,
      epsilon,
      maxAbsDiffSmoothrng,
      maxAbsDiffFilt,
      last500Signals: {
          long: last500Long,
          short: last500Short
      },
      parity_verified: !!(smoothrngCol && filtCol)
    }, null, 2));
    process.exit(0);
  }
}

runParityGate();
