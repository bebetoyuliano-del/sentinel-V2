
export type OHLCV = [number, number, number, number, number, number];

export interface RFParams {
  src?: 'close' | 'hl2' | 'hlc3' | 'ohlc4';
  per?: number;   // default 100
  mult?: number;  // default 3.0
}

function nz(v: number | null | undefined, repl: number = 0): number {
  return (v === null || v === undefined || isNaN(v)) ? repl : v;
}

function taEmaPine(series: (number | null)[], length: number): (number | null)[] {
  const out: (number | null)[] = new Array(series.length).fill(null);
  const alpha = 2 / (length + 1);
  
  let firstValidIndex = -1;
  for (let i = 0; i < series.length; i++) {
    if (series[i] !== null && !isNaN(series[i] as number)) {
      firstValidIndex = i;
      break;
    }
  }

  if (firstValidIndex === -1) return out;

  // Pine: The first valid value in the source series is used as the initial value of the EMA
  out[firstValidIndex] = series[firstValidIndex];

  for (let i = firstValidIndex + 1; i < series.length; i++) {
    const src = series[i];
    const prev = out[i - 1];
    
    if (src === null || isNaN(src as number)) {
         out[i] = null; 
    } else {
        if (prev === null) {
            // Should not happen if logic is correct and data is continuous after first valid
            out[i] = src; 
        } else {
            out[i] = alpha * (src as number) + (1 - alpha) * (prev as number);
        }
    }
  }
  return out;
}

function pickSrc(ohlcv: OHLCV[], srcType: RFParams['src'] = 'close'): number[] {
  return ohlcv.map(c => {
    const o = c[1], h = c[2], l = c[3], cl = c[4];
    if (srcType === 'hl2')   return (h + l) / 2;
    if (srcType === 'hlc3')  return (h + l + cl) / 3;
    if (srcType === 'ohlc4') return (o + h + l + cl) / 4;
    return cl;
  });
}

export function rangeFilterPineExact(ohlcv: OHLCV[], params: RFParams = {}) {
    const srcType = params.src || 'close';
    const per = params.per || 100;
    const mult = params.mult || 3.0;

    const x = pickSrc(ohlcv, srcType);
    
    // smoothrng calculation
    // wper = 2 * per - 1
    // avrng = ta.ema(math.abs(x - x[1]), per)
    // smrng = ta.ema(avrng, wper) * mult
    
    const wper = 2 * per - 1;
    
    const diffs: (number|null)[] = new Array(x.length).fill(null);
    for(let i=1; i<x.length; i++) {
        diffs[i] = Math.abs(x[i] - x[i-1]);
    }
    // diffs[0] is null/NaN matching Pine's x[1] being na at bar 0
    
    const avrng = taEmaPine(diffs, per);
    const smrng_raw = taEmaPine(avrng, wper);
    const smrng = smrng_raw.map(v => (v === null ? null : v * mult));

    // rngfilt calculation
    // rngfilt := x > nz(rngfilt[1]) ? (x - r < nz(rngfilt[1]) ? nz(rngfilt[1]) : x - r) : (x + r > nz(rngfilt[1]) ? nz(rngfilt[1]) : x + r)
    
    const rngfilt: (number|null)[] = new Array(x.length).fill(null);
    
    for(let i=0; i<x.length; i++) {
        const r = smrng[i];
        const xi = x[i];
        
        if (r === null || isNaN(r)) {
            rngfilt[i] = null; 
            continue;
        }
        
        const prev_rngfilt = (i === 0) ? null : rngfilt[i-1];
        const prev_rngfilt_nz = nz(prev_rngfilt, 0); // nz(rngfilt[1])
        
        if (xi > prev_rngfilt_nz) {
            if ((xi - r) < prev_rngfilt_nz) {
                rngfilt[i] = prev_rngfilt_nz;
            } else {
                rngfilt[i] = xi - r;
            }
        } else {
            if ((xi + r) > prev_rngfilt_nz) {
                rngfilt[i] = prev_rngfilt_nz;
            } else {
                rngfilt[i] = xi + r;
            }
        }
    }
    
    // upward / downward
    const upward: number[] = new Array(x.length).fill(0);
    const downward: number[] = new Array(x.length).fill(0);
    
    for(let i=1; i<x.length; i++) {
        const curr = rngfilt[i];
        const prev = rngfilt[i-1];
        
        if (curr === null || prev === null) {
             continue;
        }
        
        if (curr > prev) {
            upward[i] = upward[i-1] + 1;
            downward[i] = 0;
        } else if (curr < prev) {
            downward[i] = downward[i-1] + 1;
            upward[i] = 0;
        } else {
            upward[i] = upward[i-1];
            downward[i] = downward[i-1];
        }
    }
    
    // hband = rngfilt + smrng
    // lband = rngfilt - smrng
    const hband = rngfilt.map((v, i) => (v !== null && smrng[i] !== null) ? v + smrng[i]! : null);
    const lband = rngfilt.map((v, i) => (v !== null && smrng[i] !== null) ? v - smrng[i]! : null);
    
    // longCond / shortCond
    const longCond: boolean[] = new Array(x.length).fill(false);
    const shortCond: boolean[] = new Array(x.length).fill(false);
    
    for(let i=1; i<x.length; i++) {
        const xi = x[i];
        const prev_x = x[i-1];
        const f = rngfilt[i];
        const up = upward[i];
        const dn = downward[i];
        
        if (f === null) continue;
        
        const isLong = (xi > f && xi > prev_x && up > 0) || (xi > f && xi < prev_x && up > 0);
        const isShort = (xi < f && xi < prev_x && dn > 0) || (xi < f && xi > prev_x && dn > 0);
        
        longCond[i] = isLong;
        shortCond[i] = isShort;
    }
    
    // CondIni
    const CondIni: number[] = new Array(x.length).fill(0);
    for(let i=1; i<x.length; i++) {
        if (longCond[i]) CondIni[i] = 1;
        else if (shortCond[i]) CondIni[i] = -1;
        else CondIni[i] = CondIni[i-1];
    }
    
    // longCondition / shortCondition
    const longSignal: boolean[] = new Array(x.length).fill(false);
    const shortSignal: boolean[] = new Array(x.length).fill(false);
    
    for(let i=1; i<x.length; i++) {
        longSignal[i] = longCond[i] && CondIni[i-1] === -1;
        shortSignal[i] = shortCond[i] && CondIni[i-1] === 1;
    }
    
    // Trends
    const rf_trend: ('UP'|'DOWN')[] = new Array(x.length).fill('UP');
    const rf_flip: boolean[] = new Array(x.length).fill(false);
    
    for(let i=1; i<x.length; i++) {
        const curr = CondIni[i] === 1 ? 'UP' : (CondIni[i] === -1 ? 'DOWN' : rf_trend[i-1]);
        rf_trend[i] = curr;
        rf_flip[i] = (curr !== rf_trend[i-1]);
    }

    const last = x.length - 1;
    
    return {
        arrays: {
            src: x,
            avrng,
            smoothrng: smrng,
            filt: rngfilt,
            hband,
            lband,
            upward,
            downward,
            longCond,
            shortCond,
            CondIni,
            longSignal,
            shortSignal,
            rf_trend,
            rf_flip
        },
        last: {
            filt: rngfilt[last],
            hband: hband[last],
            lband: lband[last],
            rf_trend: rf_trend[last],
            rf_flip: rf_flip[last],
            longSignal: longSignal[last],
            shortSignal: shortSignal[last]
        },
        checksum: rf_trend.filter(t => t === 'UP').length
    };
}
