export function calculateSMC(ohlcv: any[]) {
  if (!Array.isArray(ohlcv) || ohlcv.length < 50) return null; // Need more data for structure
  
  const fvgs = { bullish: [] as any[], bearish: [] as any[] };
  const orderBlocks = { bullish: [] as any[], bearish: [] as any[] };
  const structure = { 
    trend: 'NEUTRAL', 
    lastBreak: null as string | null, // 'BOS_BULL', 'BOS_BEAR', 'CHOCH_BULL', 'CHOCH_BEAR'
    swingHighs: [] as number[],
    swingLows: [] as number[]
  };
  const liquiditySweeps = { bullish: [] as any[], bearish: [] as any[] };
  
  // 1. Calculate Fair Value Gaps (FVG)
  for (let i = 2; i < ohlcv.length; i++) {
    const high_prev2 = ohlcv[i-2][2];
    const low_prev2 = ohlcv[i-2][3];
    const high_curr = ohlcv[i][2];
    const low_curr = ohlcv[i][3];
    
    if (low_curr > high_prev2) fvgs.bullish.push({ top: low_curr, bottom: high_prev2, index: i });
    if (high_curr < low_prev2) fvgs.bearish.push({ top: low_prev2, bottom: high_curr, index: i });
  }
  fvgs.bullish = fvgs.bullish.slice(-2);
  fvgs.bearish = fvgs.bearish.slice(-2);
  
  // 2. Calculate Swing Points (Fractals)
  const swings = []; // { type: 'HIGH'|'LOW', price: number, index: number }
  
  for (let i = 2; i < ohlcv.length - 2; i++) {
    const h = ohlcv[i][2];
    const l = ohlcv[i][3];
    const isSwingHigh = h > ohlcv[i-1][2] && h > ohlcv[i-2][2] && h > ohlcv[i+1][2] && h > ohlcv[i+2][2];
    const isSwingLow = l < ohlcv[i-1][3] && l < ohlcv[i-2][3] && l < ohlcv[i+1][3] && l < ohlcv[i+2][3];
    
    if (isSwingHigh) {
      swings.push({ type: 'HIGH', price: h, index: i, open: ohlcv[i][1], close: ohlcv[i][4] });
      structure.swingHighs.push(h);
    }
    if (isSwingLow) {
      swings.push({ type: 'LOW', price: l, index: i, open: ohlcv[i][1], close: ohlcv[i][4] });
      structure.swingLows.push(l);
    }
  }

  // 3. Identify Order Blocks (Last opposing candle before the move that broke structure)
  const recentLows = swings.filter(s => s.type === 'LOW').slice(-2);
  for (const low of recentLows) {
    orderBlocks.bullish.push({ top: Math.max(low.open, low.close), bottom: low.price });
  }
  const recentHighs = swings.filter(s => s.type === 'HIGH').slice(-2);
  for (const high of recentHighs) {
    orderBlocks.bearish.push({ top: high.price, bottom: Math.min(high.open, high.close) });
  }

  // 4. Determine Market Structure (BOS / CHoCH)
  let currentTrend = 'NEUTRAL';
  let lastHigh = null;
  let lastLow = null;

  for (const swing of swings) {
    if (swing.type === 'HIGH') {
        if (lastHigh && swing.price > lastHigh.price) {
            // Higher High
            if (currentTrend === 'BEARISH') {
                structure.lastBreak = 'CHOCH_BULL';
                currentTrend = 'BULLISH';
            } else {
                structure.lastBreak = 'BOS_BULL';
                currentTrend = 'BULLISH';
            }
        }
        lastHigh = swing;
    } else if (swing.type === 'LOW') {
        if (lastLow && swing.price < lastLow.price) {
            // Lower Low
            if (currentTrend === 'BULLISH') {
                structure.lastBreak = 'CHOCH_BEAR';
                currentTrend = 'BEARISH';
            } else {
                structure.lastBreak = 'BOS_BEAR';
                currentTrend = 'BEARISH';
            }
        }
        lastLow = swing;
    }
  }
  structure.trend = currentTrend;
  
  // 5. Liquidity Sweeps
  if (swings.length > 2) {
    // Check recent bars for sweeps
    for (let i = ohlcv.length - 5; i < ohlcv.length; i++) {
        const bar = ohlcv[i];
        const low = bar[3];
        const high = bar[2];
        const close = bar[4];
        
        for (const swing of swings) {
            if (swing.index >= i) continue;
            if (swing.type === 'LOW' && low < swing.price && close > swing.price) {
                liquiditySweeps.bullish.push({ price: swing.price, index: i });
            }
            if (swing.type === 'HIGH' && high > swing.price && close < swing.price) {
                liquiditySweeps.bearish.push({ price: swing.price, index: i });
            }
        }
    }
  }

  // Keep only last 3 swing points for brevity
  structure.swingHighs = structure.swingHighs.slice(-3);
  structure.swingLows = structure.swingLows.slice(-3);
  liquiditySweeps.bullish = liquiditySweeps.bullish.slice(-2);
  liquiditySweeps.bearish = liquiditySweeps.bearish.slice(-2);

  return { fvgs, orderBlocks, structure, liquiditySweeps };
}

export function calculateVSA(ohlcv: any[]) {
    if (ohlcv.length < 20) return null;
    const lastBar = ohlcv[ohlcv.length - 1];
    const volume = lastBar[5];
    const avgVolume = ohlcv.slice(-20).reduce((acc: number, bar: any) => acc + bar[5], 0) / 20;
    const spread = lastBar[2] - lastBar[3];
    const avgSpread = ohlcv.slice(-20).reduce((acc: number, bar: any) => acc + (bar[2] - bar[3]), 0) / 20;
    const closePos = (lastBar[4] - lastBar[3]) / (lastBar[2] - lastBar[3] || 1);
    
    let signal = "NEUTRAL";
    if (volume > avgVolume * 1.5) {
        if (spread < avgSpread * 0.5) {
            signal = closePos > 0.5 ? "BULLISH_ABSORPTION" : "BEARISH_ABSORPTION";
        } else if (spread > avgSpread * 1.5) {
            signal = closePos > 0.7 ? "BULLISH_EFFORT" : (closePos < 0.3 ? "BEARISH_EFFORT" : "NEUTRAL");
        }
    }
    return { volumeRatio: volume / avgVolume, spreadRatio: spread / avgSpread, signal };
}

export function calculateRSIDivergence(ohlcv: any[], rsiValues: number[]) {
    if (ohlcv.length < 30 || rsiValues.length < 30) return "NONE";
    
    // Simple divergence check: compare last 2 peaks/troughs
    const lastPrice = ohlcv[ohlcv.length - 1][4];
    const prevPrice = ohlcv[ohlcv.length - 10][4];
    const lastRsi = rsiValues[rsiValues.length - 1];
    const prevRsi = rsiValues[rsiValues.length - 10];
    
    if (lastPrice > prevPrice && lastRsi < prevRsi) return "BEARISH";
    if (lastPrice < prevPrice && lastRsi > prevRsi) return "BULLISH";
    
    return "NONE";
}

export function calculateFibonacci(ohlcv: any[]) {
    if (ohlcv.length < 50) return null;
    const highs = ohlcv.slice(-50).map((b: any) => b[2]);
    const lows = ohlcv.slice(-50).map((b: any) => b[3]);
    const maxHigh = Math.max(...highs);
    const minLow = Math.min(...lows);
    const diff = maxHigh - minLow;
    return {
        high: maxHigh,
        low: minLow,
        levels: {
            "0.236": maxHigh - 0.236 * diff,
            "0.382": maxHigh - 0.382 * diff,
            "0.5": maxHigh - 0.5 * diff,
            "0.618": maxHigh - 0.618 * diff,
            "0.786": maxHigh - 0.786 * diff
        }
    };
}
