import ccxt from 'ccxt';

type RFParams = {
  src: 'close' | 'hl2' | 'hlc3' | 'ohlc4';
  rng_per: number;
  rng_qty: number;
  rng_scale: 'avg_change' | 'atr';
  f_type: 1 | 2;
  smooth_src: boolean;
  smooth_per: number;
  mode: 'dw_only';
};

function calculateRangeFilterDWOnly(ohlcv: any[], params: RFParams) {
  if (ohlcv.length < 100) return null;

  const closes = ohlcv.map(c => c[4]);
  const highs = ohlcv.map(c => c[2]);
  const lows = ohlcv.map(c => c[3]);

  const srcArray = ohlcv.map(c => {
    if (params.src === 'close') return c[4];
    if (params.src === 'hl2') return (c[2] + c[3]) / 2;
    if (params.src === 'hlc3') return (c[2] + c[3] + c[4]) / 3;
    if (params.src === 'ohlc4') return (c[1] + c[2] + c[3] + c[4]) / 4;
    return c[4];
  });

  function ema(arr: number[], period: number) {
    const k = 2 / (period + 1);
    const result = [];
    let firstValidIdx = 0;
    while (firstValidIdx < arr.length && (arr[firstValidIdx] === null || arr[firstValidIdx] === undefined || isNaN(arr[firstValidIdx]))) {
      result.push(NaN);
      firstValidIdx++;
    }
    
    if (firstValidIdx < arr.length) {
      result.push(arr[firstValidIdx]);
      for (let i = firstValidIdx + 1; i < arr.length; i++) {
        result.push(arr[i] * k + result[i - 1] * (1 - k));
      }
    }
    return result;
  }

  function atr(highs: number[], lows: number[], closes: number[], period: number) {
    const tr = [highs[0] - lows[0]];
    for (let i = 1; i < highs.length; i++) {
      const hl = highs[i] - lows[i];
      const hc = Math.abs(highs[i] - closes[i - 1]);
      const lc = Math.abs(lows[i] - closes[i - 1]);
      tr.push(Math.max(hl, hc, lc));
    }
    const result = [];
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += tr[i];
      result.push(NaN);
    }
    let rma = sum / period;
    result[period - 1] = rma;
    const alpha = 1 / period;
    for (let i = period; i < tr.length; i++) {
      rma = alpha * tr[i] + (1 - alpha) * rma;
      result.push(rma);
    }
    return result;
  }

  const src_s = params.smooth_src ? ema(srcArray, params.smooth_per) : srcArray;

  let base: number[];
  if (params.rng_scale === 'atr') {
    base = atr(highs, lows, closes, params.rng_per);
  } else {
    const absDiffs = [NaN];
    for (let i = 1; i < src_s.length; i++) {
      absDiffs.push(Math.abs(src_s[i] - src_s[i - 1]));
    }
    base = ema(absDiffs, params.rng_per);
  }

  const range = base.map(b => params.f_type === 2 ? (params.rng_qty ** 2) * b : params.rng_qty * b);

  const up_target = src_s.map((s, i) => s - range[i]); // Support (lower band base)
  const dn_target = src_s.map((s, i) => s + range[i]); // Resistance (upper band base)

  const rf_mid = [];
  const rf_up = [];
  const rf_dn = [];
  const rf_trend = [];
  const rf_flip = [];

  let trend = 'UP';
  let active_lower = up_target[0];
  let active_upper = dn_target[0];

  for (let i = 0; i < closes.length; i++) {
    if (isNaN(up_target[i]) || isNaN(dn_target[i])) {
      rf_mid.push(NaN);
      rf_up.push(NaN);
      rf_dn.push(NaN);
      rf_trend.push(trend);
      rf_flip.push(false);
      continue;
    }

    let flip = false;
    const close = closes[i];

    if (isNaN(active_lower)) active_lower = up_target[i];
    if (isNaN(active_upper)) active_upper = dn_target[i];

    if (trend === 'UP') {
      active_lower = Math.max(active_lower, up_target[i]);
      active_upper = dn_target[i]; // Upper band follows dn_target when in UP trend
      if (close < active_lower) {
        trend = 'DOWN';
        flip = true;
        active_upper = dn_target[i]; // Reset upper band on flip
      }
    } else {
      active_upper = Math.min(active_upper, dn_target[i]);
      active_lower = up_target[i]; // Lower band follows up_target when in DOWN trend
      if (close > active_upper) {
        trend = 'UP';
        flip = true;
        active_lower = up_target[i]; // Reset lower band on flip
      }
    }

    rf_trend.push(trend);
    rf_flip.push(flip);
    rf_dn.push(active_lower);
    rf_up.push(active_upper);
    rf_mid.push((active_lower + active_upper) / 2);
  }

  const checksum = rf_trend.filter(t => t === 'UP').length;

  const last = {
    rf_trend: rf_trend[rf_trend.length - 1],
    rf_flip: rf_flip[rf_flip.length - 1],
    rf_mid: rf_mid[rf_mid.length - 1],
    rf_up: rf_up[rf_up.length - 1],
    rf_dn: rf_dn[rf_dn.length - 1]
  };

  return {
    rf_mid,
    rf_up,
    rf_dn,
    rf_trend,
    rf_flip,
    last,
    checksum
  };
}

async function test() {
  const binance = new ccxt.binance({ options: { defaultType: 'future' } });
  const ohlcvRIVER = await binance.fetchOHLCV('RIVER/USDT', '4h', undefined, 1000);
  
  const params: RFParams = {
    src: 'close',
    rng_per: 14,
    rng_qty: 2.618,
    rng_scale: 'avg_change',
    f_type: 1,
    smooth_src: true,
    smooth_per: 27,
    mode: 'dw_only'
  };

  const result = calculateRangeFilterDWOnly(ohlcvRIVER, params);
  
  console.log(JSON.stringify({
    policy_version: "1.0",
    params,
    last_trend: result?.last.rf_trend,
    last_flip: result?.last.rf_flip,
    checksum: result?.checksum
  }, null, 2));
}

test();
