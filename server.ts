import dotenv from 'dotenv';
dotenv.config({ override: true });

import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import ccxt from 'ccxt';
import cors from 'cors';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { RSI, MACD, EMA } from 'technicalindicators';

// Range Filter calculation based on TradingView PineScript (Guppy)
function calculateRangeFilter(ohlcv: any[]) {
  if (ohlcv.length < 100) return null;

  const closes = ohlcv.map(c => c[4]);
  const per = 14; 
  const mult = 2.618;

  // Manual EMA to match TradingView exactly
  function ema(arr: number[], period: number) {
    const k = 2 / (period + 1);
    const result = [arr[0]];
    for (let i = 1; i < arr.length; i++) {
      result.push(arr[i] * k + result[i - 1] * (1 - k));
    }
    return result;
  }

  // avrng = ta.ema(math.abs(x - x[1]), t)
  const absDiffs = [0]; // First element has no diff
  for (let i = 1; i < closes.length; i++) {
    absDiffs.push(Math.abs(closes[i] - closes[i - 1]));
  }
  const avrng = ema(absDiffs, per);

  // wper = (t*2) - 1
  const wper = (per * 2) - 1;
  // smoothrng = ta.ema(avrng, wper) * m
  const smoothrng = ema(avrng, wper).map(val => val * mult);

  // rngfilt(x, r) =>
  //     rngfilt  = x
  //     rngfilt := x > nz(rngfilt[1]) ? ((x - r) < nz(rngfilt[1]) ? nz(rngfilt[1]) : (x - r)) : ((x + r) > nz(rngfilt[1]) ? nz(rngfilt[1]) : (x + r))
  //     rngfilt
  const rngfilt = [closes[0]];
  for (let i = 1; i < closes.length; i++) {
    const x = closes[i];
    const r = smoothrng[i];
    const prev_filt = rngfilt[i - 1];

    let new_filt = x;
    if (x > prev_filt) {
      new_filt = (x - r) < prev_filt ? prev_filt : (x - r);
    } else {
      new_filt = (x + r) > prev_filt ? prev_filt : (x + r);
    }
    rngfilt.push(new_filt);
  }

  // upward   = 0.0
  // upward  := filt > filt[1] ? nz(upward[1]) + 1 : filt < filt[1] ? 0 : nz(upward[1])
  // downward = 0.0
  // downward:= filt < filt[1] ? nz(downward[1]) + 1 : filt > filt[1] ? 0 : nz(downward[1])
  const upward = [0];
  const downward = [0];
  for (let i = 1; i < rngfilt.length; i++) {
    const filt = rngfilt[i];
    const prev_filt = rngfilt[i - 1];
    
    let up = 0;
    if (filt > prev_filt) {
      up = upward[i - 1] + 1;
    } else if (filt < prev_filt) {
      up = 0;
    } else {
      up = upward[i - 1];
    }
    upward.push(up);

    let down = 0;
    if (filt < prev_filt) {
      down = downward[i - 1] + 1;
    } else if (filt > prev_filt) {
      down = 0;
    } else {
      down = downward[i - 1];
    }
    downward.push(down);
  }

  // Trend direction
  const trend = ["UP"]; // Default
  for (let i = 1; i < closes.length; i++) {
    if (upward[i] > 0) {
      trend.push("UP");
    } else if (downward[i] > 0) {
      trend.push("DOWN");
    } else {
      trend.push(trend[i - 1]);
    }
  }

  return {
    trend: trend[trend.length - 1],
    isFlip: trend[trend.length - 1] !== trend[trend.length - 2],
    upBand: rngfilt[rngfilt.length - 1] + smoothrng[smoothrng.length - 1],
    dnBand: rngfilt[rngfilt.length - 1] - smoothrng[smoothrng.length - 1]
  };
}

// Relational Quadratic Kernel Channel [Vin]
function calculateRQK(ohlcv: any[], length = 42, relativeWeight = 27, atrLength = 40) {
  if (ohlcv.length < Math.max(length, atrLength) + 1) return null;

  const ohlc4 = ohlcv.map(c => (c[1] + c[2] + c[3] + c[4]) / 4);
  const highs = ohlcv.map(c => c[2]);
  const lows = ohlcv.map(c => c[3]);
  const closes = ohlcv.map(c => c[4]);

  // Calculate True Range
  const tr = [0];
  for (let i = 1; i < ohlcv.length; i++) {
    const high = highs[i];
    const low = lows[i];
    const prevClose = closes[i - 1];
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }

  // Calculate ATR (RMA)
  const atr = [tr[0]];
  for (let i = 1; i < tr.length; i++) {
    atr.push((atr[i - 1] * (atrLength - 1) + tr[i]) / atrLength);
  }

  // Calculate Rational Quadratic Estimate
  const rqk = [];
  for (let i = 0; i < ohlc4.length; i++) {
    if (i < length) {
      rqk.push(ohlc4[i]);
      continue;
    }
    let currentWeight = 0;
    let cumulativeWeight = 0;
    for (let j = 0; j <= length; j++) {
      const y = ohlc4[i - j];
      const w = Math.pow(1 + (Math.pow(j, 2) / ((length * length) * 2 * relativeWeight)), -relativeWeight);
      currentWeight += y * w;
      cumulativeWeight += w;
    }
    rqk.push(currentWeight / cumulativeWeight);
  }

  const lastIndex = ohlcv.length - 1;
  const currentRQK = rqk[lastIndex];
  const currentATR = atr[lastIndex];
  const currentClose = closes[lastIndex];
  
  // Determine price position relative to channels
  let position = "NEUTRAL (Inside Channel 1)";
  if (currentClose > currentRQK + (currentATR * 6)) position = "EXTREME_OVERBOUGHT (Above Upper Channel 3)";
  else if (currentClose > currentRQK + (currentATR * 5)) position = "OVERBOUGHT (Above Upper Channel 2)";
  else if (currentClose > currentRQK + (currentATR * 1.5)) position = "BULLISH_TREND (Above Upper Channel 1)";
  else if (currentClose < currentRQK - (currentATR * 6)) position = "EXTREME_OVERSOLD (Below Lower Channel 3)";
  else if (currentClose < currentRQK - (currentATR * 5)) position = "OVERSOLD (Below Lower Channel 2)";
  else if (currentClose < currentRQK - (currentATR * 1.5)) position = "BEARISH_TREND (Below Lower Channel 1)";

  return {
    estimate: currentRQK,
    position: position,
    upperChannel1: currentRQK + (currentATR * 1.5),
    lowerChannel1: currentRQK - (currentATR * 1.5),
    upperChannel3: currentRQK + (currentATR * 6),
    lowerChannel3: currentRQK - (currentATR * 6)
  };
}

// Waddah Attar Explosion [LazyBear]
function calculateWAE(ohlcv: any[], sensitivity = 150, fastLength = 20, slowLength = 40, channelLength = 20, mult = 2.0, deadZone = 20) {
  if (ohlcv.length < Math.max(slowLength, channelLength) + 1) return null;

  const closes = ohlcv.map(c => c[4]);

  // Helper: EMA
  function ema(arr: number[], period: number) {
    const k = 2 / (period + 1);
    const result = [arr[0]];
    for (let i = 1; i < arr.length; i++) {
      result.push(arr[i] * k + result[i - 1] * (1 - k));
    }
    return result;
  }

  // Helper: SMA
  function sma(arr: number[], period: number) {
    const result = [];
    for (let i = 0; i < arr.length; i++) {
      if (i < period - 1) {
        result.push(arr[i]); // Fallback for early indices
        continue;
      }
      let sum = 0;
      for (let j = 0; j < period; j++) sum += arr[i - j];
      result.push(sum / period);
    }
    return result;
  }

  // Helper: Stdev (Population)
  function stdev(arr: number[], period: number, smaArr: number[]) {
    const result = [];
    for (let i = 0; i < arr.length; i++) {
      if (i < period - 1) {
        result.push(0);
        continue;
      }
      const mean = smaArr[i];
      let sumSq = 0;
      for (let j = 0; j < period; j++) {
        sumSq += Math.pow(arr[i - j] - mean, 2);
      }
      result.push(Math.sqrt(sumSq / period));
    }
    return result;
  }

  // 1. MACD Difference (t1)
  const fastEMA = ema(closes, fastLength);
  const slowEMA = ema(closes, slowLength);
  const macd = [];
  for (let i = 0; i < closes.length; i++) {
    macd.push(fastEMA[i] - slowEMA[i]);
  }

  const t1 = [0];
  for (let i = 1; i < macd.length; i++) {
    t1.push((macd[i] - macd[i - 1]) * sensitivity);
  }

  // 2. Bollinger Bands Difference (e1 - Explosion Line)
  const basis = sma(closes, channelLength);
  const dev = stdev(closes, channelLength, basis);
  const e1 = [];
  for (let i = 0; i < closes.length; i++) {
    const upper = basis[i] + (mult * dev[i]);
    const lower = basis[i] - (mult * dev[i]);
    e1.push(upper - lower);
  }

  // 3. Trend Up / Trend Down
  const trendUp = t1.map(val => val >= 0 ? val : 0);
  const trendDown = t1.map(val => val < 0 ? -val : 0);

  const lastIdx = closes.length - 1;
  const currentUp = trendUp[lastIdx];
  const currentDown = trendDown[lastIdx];
  const currentE1 = e1[lastIdx];

  const trend = currentUp > 0 ? "UP" : (currentDown > 0 ? "DOWN" : "NEUTRAL");
  const strength = Math.max(currentUp, currentDown);
  const isExploding = strength > currentE1;
  const isDeadZone = strength < deadZone;

  return {
    trend: trend,
    strength: parseFloat(strength.toFixed(2)),
    explosionLine: parseFloat(currentE1.toFixed(2)),
    isExploding: isExploding,
    isDeadZone: isDeadZone
  };
}

// Smart Money Concepts (SMC) Simplified Calculation
function calculateSMC(ohlcv: any[]) {
  if (!Array.isArray(ohlcv) || ohlcv.length < 50) return null; // Need more data for structure
  
  const fvgs = { bullish: [] as any[], bearish: [] as any[] };
  const orderBlocks = { bullish: [] as any[], bearish: [] as any[] };
  const structure = { 
    trend: 'NEUTRAL', 
    lastBreak: null as string | null, // 'BOS_BULL', 'BOS_BEAR', 'CHOCH_BULL', 'CHOCH_BEAR'
    swingHighs: [] as number[],
    swingLows: [] as number[]
  };
  
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
  
  // Keep only last 3 swing points for brevity
  structure.swingHighs = structure.swingHighs.slice(-3);
  structure.swingLows = structure.swingLows.slice(-3);

  return { fvgs, orderBlocks, structure };
}

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

// API Keys
const BINANCE_API_KEY = process.env.BINANCE_API_KEY;
const BINANCE_API_SECRET = process.env.BINANCE_API_SECRET;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

console.log('--- Environment Variables Debug ---');
console.log('BINANCE_API_KEY:', BINANCE_API_KEY ? 'Set' : 'Missing');
console.log('TELEGRAM_BOT_TOKEN:', TELEGRAM_BOT_TOKEN ? 'Set' : 'Missing');
console.log('GEMINI_API_KEY:', GEMINI_API_KEY ? `Set (${GEMINI_API_KEY.substring(0, 5)}...)` : 'Missing');
console.log('-----------------------------------');

// Initialize clients
const binance = new ccxt.binance({
  apiKey: process.env.BINANCE_API_KEY,
  secret: process.env.BINANCE_API_SECRET,
  enableRateLimit: true,
  options: {
    defaultType: 'future', // Assuming futures for long/short positions
    warnOnFetchOpenOrdersWithoutSymbol: false, // Suppress strict rate limit warning
  },
});

function getAI() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY (or GOOGLE_API_KEY/API_KEY) is missing. Please configure it in the Secrets panel.');
  }
  return new GoogleGenAI({ apiKey: key });
}

// In-memory storage for signals
let signals: any[] = [];
let isBotRunning = false;
let monitorInterval: NodeJS.Timeout | null = null;

// Helper to send Telegram message
async function sendTelegramMessage(text: string, reply_markup?: any) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  
  // Telegram limits messages to 4096 characters. We split at 4000 to be safe.
  const MAX_LENGTH = 4000;
  const messages = [];
  
  if (text.length <= MAX_LENGTH) {
    messages.push(text);
  } else {
    // Split by double newline to keep paragraphs intact if possible
    const paragraphs = text.split('\n\n');
    let currentMessage = '';
    
    for (const paragraph of paragraphs) {
      if ((currentMessage + paragraph + '\n\n').length <= MAX_LENGTH) {
        currentMessage += paragraph + '\n\n';
      } else {
        if (currentMessage) messages.push(currentMessage.trim());
        // If a single paragraph is still too long, split it by chunks
        if (paragraph.length > MAX_LENGTH) {
          let remaining = paragraph;
          while (remaining.length > 0) {
            messages.push(remaining.substring(0, MAX_LENGTH));
            remaining = remaining.substring(MAX_LENGTH);
          }
          currentMessage = '';
        } else {
          currentMessage = paragraph + '\n\n';
        }
      }
    }
    if (currentMessage) messages.push(currentMessage.trim());
  }

  try {
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      // Only attach reply_markup to the last message part
      const options: any = {
        chat_id: TELEGRAM_CHAT_ID,
        text: msg,
        parse_mode: 'HTML' // Enable HTML parsing for better formatting
      };
      
      if (i === messages.length - 1 && reply_markup) {
        options.reply_markup = reply_markup;
      }

      try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, options);
      } catch (htmlError: any) {
        console.warn('Failed to send HTML message, retrying as plain text:', htmlError.response?.data || htmlError.message);
        // Fallback to plain text
        delete options.parse_mode;
        // Strip HTML tags for plain text readability (basic strip)
        options.text = msg.replace(/<[^>]*>/g, ''); 
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, options);
      }
      
      // Add a small delay between messages to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    console.log(`Successfully sent ${messages.length} Telegram message(s).`);
  } catch (error: any) {
    console.error('Failed to send Telegram message (Final):', error.response?.data || error.message);
  }
}

// Helper to fetch market data with technical indicators
async function fetchMarketDataWithIndicators(symbols: string[]) {
  const marketData: any = {};
  
  // Use Promise.all to fetch data in parallel (limited to 5 concurrent requests to avoid rate limits)
  const chunkArray = (arr: string[], size: number) => 
    Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));
  
  const chunks = chunkArray(symbols, 5);
  
  for (const chunk of chunks) {
    await Promise.all(chunk.map(async (pair) => {
      try {
        const ohlcv = await binance.fetchOHLCV(pair, '1h', undefined, 500);
        const closes = ohlcv.map(c => c[4] as number);
        const ticker = await binance.fetchTicker(pair);
        
        const rsi = RSI.calculate({ values: closes, period: 14 });
        const macd = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
        const ema20 = EMA.calculate({ values: closes, period: 20 });
        const ema50 = EMA.calculate({ values: closes, period: 50 });
        const rangeFilter = calculateRangeFilter(ohlcv);
        const smc = calculateSMC(ohlcv);
        const rqk = calculateRQK(ohlcv);
        const wae = calculateWAE(ohlcv);
        
        marketData[pair] = {
          currentPrice: ticker.last,
          RSI_14: rsi.length > 0 ? rsi[rsi.length - 1] : null,
          MACD: macd.length > 0 ? macd[macd.length - 1] : null,
          EMA_20: ema20.length > 0 ? ema20[ema20.length - 1] : null,
          EMA_50: ema50.length > 0 ? ema50[ema50.length - 1] : null,
          RangeFilter: rangeFilter,
          RQK_Channel: rqk,
          WAE: wae,
          SMC: smc
        };
      } catch (e) {
        console.error(`Error fetching data for ${pair}:`, e);
      }
    }));
  }
  return marketData;
}

// Hedging Recovery & Net BEP Calculator
function calculateHedgingRecovery(positions: any[]) {
  const recoveryData: any = {};
  
  // Group by symbol
  const bySymbol: any = {};
  for (const p of positions) {
    if (!bySymbol[p.symbol]) bySymbol[p.symbol] = { long: null, short: null };
    if (p.side === 'long') bySymbol[p.symbol].long = p;
    if (p.side === 'short') bySymbol[p.symbol].short = p;
  }

  for (const sym in bySymbol) {
    const longPos = bySymbol[sym].long;
    const shortPos = bySymbol[sym].short;
    
    if (longPos && shortPos) {
      const longPrice = longPos.entryPrice;
      const longSize = longPos.contracts;
      const shortPrice = shortPos.entryPrice;
      const shortSize = shortPos.contracts;
      
      const totalValLong = longPrice * longSize;
      const totalValShort = shortPrice * shortSize;
      const diffSize = longSize - shortSize;
      
      let netBep = 0;
      if (diffSize !== 0) {
        netBep = (totalValLong - totalValShort) / diffSize;
      } else {
        netBep = (longPrice + shortPrice) / 2;
      }
      
      const isNetShort = shortSize > longSize;
      const status = isNetShort ? "NET SHORT (Butuh Harga TURUN)" : (longSize > shortSize ? "NET LONG (Butuh Harga NAIK)" : "NEUTRAL (Locking Sempurna)");
      
      recoveryData[sym] = {
        longSize,
        longPrice,
        shortSize,
        shortPrice,
        netBep,
        status,
        diffSize: Math.abs(diffSize)
      };
    }
  }
  
  return recoveryData;
}

// Helper to call Gemini API with retry logic
async function generateWithRetry(prompt: string, modelName: string = 'gemini-3.1-pro-preview', maxRetries: number = 3, jsonMode: boolean = false) {
  const ai = getAI();
  let attempt = 0;
  
  // First try with the requested model (e.g. Pro)
  while (attempt < maxRetries) {
    try {
      const config: any = {
        model: modelName,
        contents: prompt,
      };
      
      if (jsonMode) {
        config.config = { responseMimeType: 'application/json' };
      }

      const response = await ai.models.generateContent(config);
      return response.text;
    } catch (error: any) {
      attempt++;
      console.error(`Gemini API Error (${modelName} - Attempt ${attempt}/${maxRetries}):`, error.message || error);
      
      // If it's the last attempt, break to try fallback
      if (attempt >= maxRetries) break;
      
      // Wait before retrying (exponential backoff: 2s, 4s, 8s)
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`Waiting ${delay}ms before retrying...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // If Pro model failed, try Flash model as fallback
  if (modelName === 'gemini-3.1-pro-preview') {
    console.log('Falling back to gemini-3-flash-preview...');
    try {
      const config: any = {
        model: 'gemini-3-flash-preview',
        contents: prompt,
      };
      
      if (jsonMode) {
        config.config = { responseMimeType: 'application/json' };
      }

      const response = await ai.models.generateContent(config);
      return response.text;
    } catch (error: any) {
      console.error('Fallback model also failed:', error.message || error);
    }
  }

  throw new Error(`Failed to get response from Gemini after all attempts.`);
}

// Core monitoring function
async function monitorMarkets() {
  try {
    console.log('Fetching market data and positions...');
    
    // 1. Fetch current positions and open orders
    let positions = [];
    let openOrders = [];
    if (BINANCE_API_KEY && BINANCE_API_SECRET) {
      try {
        const allPositions = await binance.fetchPositions();
        positions = allPositions.filter((p: any) => p.contracts > 0);
        openOrders = await binance.fetchOpenOrders();
      } catch (e) {
        console.error('Error fetching positions/orders:', e);
      }
    }

    // 2. Fetch market data for top 20 pairs by volume and open positions
    let top20Symbols: string[] = ['BTC/USDT', 'ETH/USDT'];
    if (BINANCE_API_KEY && BINANCE_API_SECRET) {
      try {
        const tickers = await binance.fetchTickers();
        const usdtPairs = Object.values(tickers)
          .filter((t: any) => t.symbol && t.symbol.includes('/USDT'))
          .sort((a: any, b: any) => (b.quoteVolume || 0) - (a.quoteVolume || 0));
        top20Symbols = usdtPairs.slice(0, 20).map((t: any) => t.symbol);
      } catch (e) {
        console.error('Error fetching top tickers:', e);
      }
    }
    const positionSymbols = [...new Set(positions.map((p: any) => p.symbol))];
    const symbolsToFetch = [...new Set([...top20Symbols, ...positionSymbols])];
    const marketData = await fetchMarketDataWithIndicators(symbolsToFetch);
    const hedgingRecovery = calculateHedgingRecovery(positions);
    const accountRisk = await fetchAccountRisk();

    // 3. Analyze with Gemini
    const ai = getAI();
    const prompt = `
      Anda adalah asisten trading crypto cerdas (Crypto Sentinel) dengan spesialisasi PENYELAMATAN AKUN (HEDGING RECOVERY 2X MODE).
      
      KONSEP UTAMA (WAJIB DIPAHAMI):
      Strategi Recovery ini menggunakan konsep "Rasio 2:1 Searah Tren".
      - Jika posisi sedang Locking (Long = Short) dan mengalami Floating Loss:
        - Cek Tren (RangeFilter).
        - OPSI A (Aggressive): Tambah muatan Searah Tren (ADD) sehingga Total Searah Tren = 2x Total Lawan Tren.
        - OPSI B (Conservative): Kurangi muatan Lawan Tren (REDUCE 50%) sehingga Total Searah Tren = 2x Total Lawan Tren.
      
      PENGGANTI STOP LOSS (STOP HEDGING):
      - Dalam mode recovery ini, KITA TIDAK MENGGUNAKAN STOP LOSS KONVENSIONAL.
      - Pengganti Stop Loss adalah KEMBALI KE MODE LOCKING 1:1 (NEUTRAL).
      - WAJIB: Untuk setiap posisi yang tidak 1:1 (Net Long atau Net Short), TENTUKAN "HARGA STOP HEDGING".
      - Harga Stop Hedging adalah titik harga dimana tren dianggap berbalik arah (Flip) atau menembus Support/Resistance kunci.
      - Jika harga menyentuh titik ini, sarankan "LOCK_NEUTRAL" (Buka posisi lawan sebesar selisihnya).
      
      Data Akun & Risiko:
      - Margin Ratio: ${accountRisk ? accountRisk.marginRatio.toFixed(2) + '%' : 'N/A'} (Maksimal Aman: 25%)
      - Saldo Wallet: $${accountRisk ? accountRisk.walletBalance.toFixed(2) : 'N/A'}
      
      Data Pasar (1H):
      ${JSON.stringify(marketData, null, 2)}
      
      Posisi Terbuka (PORTFOLIO):
      ${JSON.stringify(positions.map((p: any) => ({symbol: p.symbol, side: p.side, size: p.contracts, entryPrice: p.entryPrice, pnl: p.unrealizedPnl})), null, 2)}
      
      TUGAS ANDA:
      1. Analisa setiap pair yang memiliki posisi terbuka. Karena pengguna menggunakan Hedging Recovery, JANGAN sarankan Cut Loss kecuali sangat terpaksa.
      2. Tentukan "strategi recovery" berdasarkan TREN (RangeFilter) untuk mencapai Rasio 2:1. ANDA WAJIB MEMATUHI ATURAN INI TANPA TERKECUALI:
         
         KASUS A: Posisi Masih 1:1 (Locking) & Tren UP (Bullish)
         - Target: Long harus 2x Short.
         - Cek PnL posisi SHORT (Lawan Tren).
         - JIKA Short sedang PROFIT (Hijau) -> WAJIB PILIH "REDUCE_SHORT" (50%). 
         - JIKA Short sedang LOSS (Merah) -> Cek Margin Ratio.
           - Jika Margin > 15% (Mulai Padat) -> PILIH "REDUCE_SHORT" (50%) 
           - Jika Margin < 15% (Masih Longgar) -> BOLEH PILIH "ADD_LONG" (100%) 

         KASUS B: Posisi Masih 1:1 (Locking) & Tren DOWN (Bearish)
         - Target: Short 2x Long dengan kondisi dibawah ini.
         - Cek PnL posisi LONG (Lawan Tren).
         - JIKA Long sedang PROFIT (Hijau) -> WAJIB PILIH "REDUCE_LONG" (50%). 
         - JIKA Long sedang LOSS (Merah) -> Cek Margin Ratio.
           - Jika Margin > 15% -> WAJIB PILIH "HOLD". Jangan lakukan REDUCE_LONG jika posisi Long sedang loss dan margin padat. Tunggu sampai ada tren reversal dari indikator baru TP posisi short yang profit untuk mengurangi beban margin.
           - Jika Margin < 15% -> BOLEH PILIH "ADD_SHORT" (100%).

         KASUS C: Posisi Sudah 2:1 (Recovery Mode Berjalan)
         - Jika Tren MASIH SESUAI -> "HOLD". 
           - Berikan "HARGA STOP HEDGING" (Titik balik arah / Support kuat jika Long, Resistance kuat jika Short).
           - PENTING UNTUK KASUS C: Karena posisi sedang menuju BEP/Profit, Anda WAJIB menganalisa area Rejection/Resistance (untuk Long) atau Support (untuk Short) di depan. Jika harga mendekati area tersebut, sarankan "ADD_SHORT" (jika sedang 2:1 Long) atau "ADD_LONG" (jika sedang 2:1 Short) sebesar selisihnya untuk melakukan LOCKING (mengamankan margin yang tercipta dari tren yang menguntungkan ini sebelum harga memantul turun/naik).
         - Jika Tren BERBALIK (Salah Prediksi) -> "LOCK_NEUTRAL" (Segera tambah posisi lawan agar kembali 1:1).

      4. SANGAT PENTING: Gunakan indikator "RangeFilter" sebagai acuan tren, dan gunakan contoh kasus pada Tugas no 2 "strategi recovery" sebagai acuan target harga pemulihan. JANGAN MENGABAIKAN ATURAN MARGIN > 15%.
      
      5. GUNAKAN INDIKATOR RQK (Relational Quadratic Kernel Channel):
         - Gunakan RQK sebagai KONFIRMASI dari Range Filter.
         - Perhatikan status "position" pada RQK_Channel.
         - Jika harga berada di area "EXTREME_OVERBOUGHT" atau "OVERBOUGHT", ini adalah area yang sangat baik untuk melakukan "ADD_SHORT" (Hedging) atau "TAKE PROFIT" posisi Long.
         - Jika harga berada di area "EXTREME_OVERSOLD" atau "OVERSOLD", ini adalah area yang sangat baik untuk melakukan "ADD_LONG" (Hedging) atau "TAKE PROFIT" posisi Short.
         - Jangan menambah muatan searah tren (ADD) jika harga sudah berada di area EXTREME.

      6. GUNAKAN INDIKATOR WAE (Waddah Attar Explosion):
         - WAE digunakan untuk mengukur KEKUATAN TREN (Trend Strength) dan LEDAKAN VOLATILITAS (Explosion).
         - Jika "isExploding" bernilai true, berarti tren saat ini sangat kuat. JANGAN melawan tren yang sedang meledak (hindari posisi counter-trend).
         - Jika "isDeadZone" bernilai true, berarti pasar sedang sideway atau momentum lemah. Hindari entry agresif.
         - Padukan dengan Range Filter: Jika Range Filter UP dan WAE "isExploding" true (dengan WAE trend UP), maka tren naik sangat valid.

      7. GUNAKAN SMART MONEY CONCEPTS (SMC) SECARA MENDALAM:
         - Analisa STRUKTUR PASAR (Market Structure): Identifikasi apakah terjadi Break of Structure (BOS) atau Change of Character (CHoCH). Sebutkan posisi Higher High, Higher Low dan Struktur Pasar saat ini.
         - Gunakan Order Block (OB) Bullish dan FVG Bullish sebagai area pantulan kuat untuk menambah muatan Add Long atau Take Profit posisi Short.
         - Gunakan Order Block (OB) Bearish dan FVG Bearish sebagai area resisten kuat untuk membuka atau posisi Short baru (Hedging) atau Take Profit posisi Long.
      
      8. Berikan rekomendasi berupa informasi TINDAKAN KONKRET setiap Pair symbol dalam telegram urutkan Symbol dari A ke Z.
         - sertakan symbol misalnya "BTC/USDT"
         - action nya apa misalnya : "REDUCE_LONG" | "REDUCE_SHORT" | "ADD_LONG" | "ADD_SHORT" | "HOLD" | "TAKE PROFIT" | "LOCK_NEUTRAL"
         - berikan informasi "percentage": number, // 50 (untuk reduce), 100 (untuk add 2x), atau sesuai kebutuhan locking.
         - informasi "target_price": number | string, // HARGA MASUK IDEAL (Area FVG/Order Block/RQK Channel) jika ADD. Jika REDUCE/HOLD, isi "Market Price". (Gunakan key 'target_price' di JSON untuk eksekusi).
         - informasi "stop_hedging_price": number, // HARGA DIMANA USER HARUS MELAKUKAN LOCKING KEMBALI (STOP LOSS PENGGANTI)
         - informasi "reason": "Alasan teknikal berdasarkan Smart Money Concepts, Range Filter, RQK Channel, WAE, dan indikator lainnya yang tersedia untuk membuat analisa"
      
      IMPORTANT: Output MUST be in valid JSON format:
      {
        "market_summary": "Ringkasan singkat...",
        "recovery_plan": [
          {
            "symbol": "BTC/USDT",
            "action": "REDUCE_LONG" | "REDUCE_SHORT" | "ADD_LONG" | "ADD_SHORT" | "HOLD" | "TAKE PROFIT" | "LOCK_NEUTRAL",
            "percentage": 50,
            "target_price": 60000,
            "stop_hedging_price": 59000,
            "reason": "Struktur pasar saat ini membuat Higher High..."
          }
        ]
      }
    `;

    // Switched to gemini-3-flash-preview for better stability
    const analysisJson = await generateWithRetry(prompt, 'gemini-3-flash-preview', 3, true);
    
    if (!analysisJson) {
      throw new Error('Failed to generate analysis');
    }

    let analysisData;
    try {
        analysisData = JSON.parse(analysisJson);
    } catch (e) {
        console.error("Failed to parse JSON from Gemini:", e);
        analysisData = {
            market_summary: "Error parsing analysis.",
            recovery_plan: []
        };
    }
    
    // Format message for Telegram
    let message = `🛡️ <b>HEDGING RECOVERY MODE</b> 🛡️\n\n`;
    message += `📊 <b>Market Insight:</b>\n${analysisData.market_summary}\n\n`;
    
    const inlineKeyboard = [];

    if (analysisData.recovery_plan && analysisData.recovery_plan.length > 0) {
        message += `🚑 <b>Recovery Actions:</b>\n`;
        for (const plan of analysisData.recovery_plan) {
            let emoji = '✋';
            if (plan.action.includes('REDUCE') || plan.action.includes('TAKE PROFIT')) emoji = '✂️';
            if (plan.action.includes('ADD')) emoji = '➕';
            if (plan.action.includes('LOCK_NEUTRAL')) emoji = '🛡️';
            
            message += `\n<b>${plan.symbol}</b> - ${emoji} ${plan.action.replace('_', ' ')}\n`;
            
            if (plan.target_price) {
                 message += `🎯 <b>Target Price:</b> ${plan.target_price}\n`;
            }
            
            message += `<i>${plan.reason}</i>\n`;
            
            if (plan.stop_hedging_price) {
                message += `🛑 <b>Stop Hedge @ ${plan.stop_hedging_price}</b> (Lock Kembali)\n`;
            }
            
            // Only create buttons for actionable items
            if (['REDUCE_LONG', 'REDUCE_SHORT', 'ADD_LONG', 'ADD_SHORT', 'LOCK_NEUTRAL'].includes(plan.action)) {
                // Shorten action text for button
                const actionText = plan.action.replace('REDUCE_', 'CUT ').replace('ADD_', 'ADD ').replace('_', ' ');
                const btnText = `⚡ ${actionText} ${plan.symbol} (${plan.percentage}%)`;
                
                // Compact callback data to fit 64 bytes: "a|s|p|tp|sh"
                const actionMap: any = { 'ADD_LONG': 'AL', 'ADD_SHORT': 'AS', 'REDUCE_LONG': 'RL', 'REDUCE_SHORT': 'RS', 'LOCK_NEUTRAL': 'LN' };
                const a = actionMap[plan.action] || plan.action;
                const s = plan.symbol.split('/')[0]; // Just the base asset
                const p = plan.percentage || 100;
                const tp = typeof plan.target_price === 'number' ? plan.target_price : '';
                const sh = plan.stop_hedging_price || '';
                
                const compactData = `${a}|${s}|${p}|${tp}|${sh}`;

                inlineKeyboard.push([
                    {
                        text: btnText,
                        callback_data: compactData
                    }
                ]);
            }
        }
    }
    
    const newSignal = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      content: message.replace(/<[^>]*>/g, ''),
    };
    signals.unshift(newSignal);
    if (signals.length > 50) signals.pop();

    const replyMarkup = inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : undefined;
    await sendTelegramMessage(message, replyMarkup);
    
  } catch (error) {
    console.error('Error in monitorMarkets:', error);
    throw error;
  }
}

// API Routes
app.get('/api/status', (req, res) => {
  res.json({
    isBotRunning,
    apiKeysConfigured: {
      binance: !!(BINANCE_API_KEY && BINANCE_API_SECRET),
      telegram: !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID),
    },
  });
});

app.post('/api/bot/toggle', async (req, res) => {
  if (isBotRunning) {
    if (monitorInterval) clearInterval(monitorInterval);
    isBotRunning = false;
    res.json({ isBotRunning });
  } else {
    try {
      await monitorMarkets();
      monitorInterval = setInterval(() => {
        monitorMarkets().catch(console.error);
      }, 3600000);
      isBotRunning = true;
      res.json({ isBotRunning });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to start bot' });
    }
  }
});

app.post('/api/bot/force-run', async (req, res) => {
  try {
    await monitorMarkets();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to run bot' });
  }
});

app.get('/api/signals', (req, res) => {
  res.json(signals);
});

// Helper to fetch account risk data
async function fetchAccountRisk() {
  try {
    const balance = await binance.fetchBalance();
    const info = balance.info; // Raw Binance response

    const totalMaintMargin = parseFloat(info.totalMaintMargin || '0');
    const totalMarginBalance = parseFloat(info.totalMarginBalance || '0');
    const marginRatio = totalMarginBalance > 0 ? (totalMaintMargin / totalMarginBalance) * 100 : 0;

    const walletBalance = parseFloat(info.totalWalletBalance || '0');
    const unrealizedPnl = parseFloat(info.totalUnrealizedProfit || '0');
    const marginAvailable = parseFloat(info.availableBalance || '0');

    // Fetch Daily Realized PNL (Last 24h)
    let dailyRealizedPnl = 0;
    try {
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        // Use direct API call as fetchIncome might not be available in some ccxt versions or configurations
        // fapiPrivateGetIncome is for USDT-M Futures
        const income = await binance.fapiPrivateGetIncome({
          incomeType: 'REALIZED_PNL',
          startTime: oneDayAgo,
          limit: 1000
        });
        
        if (Array.isArray(income)) {
          dailyRealizedPnl = income.reduce((acc: number, curr: any) => acc + parseFloat(curr.income), 0);
        }
    } catch (e) {
        console.error('Error fetching income:', e);
    }

    return {
      marginRatio,
      marginAvailable,
      walletBalance,
      unrealizedPnl,
      dailyRealizedPnl
    };
  } catch (e) {
    console.error('Error fetching account risk:', e);
    return null;
  }
}

app.get('/api/account', async (req, res) => {
  if (!BINANCE_API_KEY || !BINANCE_API_SECRET) {
    return res.status(400).json({ error: 'Binance API keys not configured' });
  }
  const data = await fetchAccountRisk();
  if (data) res.json(data);
  else res.status(500).json({ error: 'Failed to fetch account data' });
});

app.get('/api/positions', async (req, res) => {
  if (!BINANCE_API_KEY || !BINANCE_API_SECRET) {
    return res.status(400).json({ error: 'Binance API keys not configured' });
  }
  try {
    const allPositions = await binance.fetchPositions();
    const activePositions = allPositions.filter((p: any) => p.contracts > 0);
    res.json(activePositions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

async function generateAiReply(userMessage: string) {
  let positions = [];
  let openOrders = [];
  let marketData: any = {};
  let hedgingRecovery: any = {};
  
  // Extract potential symbols from user message (e.g., "BTCUSDT", "ETH/USDT", "SOL")
  const potentialSymbols = userMessage.toUpperCase().match(/[A-Z0-9]{2,10}(USDT|\/USDT)?/g) || [];
  const requestedSymbols = potentialSymbols.map(s => {
    if (s.includes('/USDT')) return s;
    if (s.endsWith('USDT')) return s.replace('USDT', '/USDT');
    return `${s}/USDT`;
  });

  if (BINANCE_API_KEY && BINANCE_API_SECRET) {
    try {
      await binance.loadMarkets(); // Load markets first to validate symbols
      
      const allPositions = await binance.fetchPositions();
      positions = allPositions.filter((p: any) => p.contracts > 0);
      openOrders = await binance.fetchOpenOrders();
      
      let top10Symbols: string[] = ['BTC/USDT', 'ETH/USDT'];
      try {
        const tickers = await binance.fetchTickers();
        const usdtPairs = Object.values(tickers)
          .filter((t: any) => t.symbol && t.symbol.includes('/USDT'))
          .sort((a: any, b: any) => (b.quoteVolume || 0) - (a.quoteVolume || 0));
        top10Symbols = usdtPairs.slice(0, 10).map((t: any) => t.symbol);
      } catch (e) {
        console.error('Error fetching top tickers for chat:', e);
      }
      
      const positionSymbols = [...new Set(positions.map((p: any) => p.symbol))];
      
      // Filter out invalid symbols by checking if they exist in Binance markets
      const validRequestedSymbols = requestedSymbols.filter(sym => binance.markets[sym]);
      
      const symbolsToFetch = [...new Set([...top10Symbols, ...positionSymbols, ...validRequestedSymbols])];
      
      marketData = await fetchMarketDataWithIndicators(symbolsToFetch);
      hedgingRecovery = calculateHedgingRecovery(positions);
    } catch (e) {
      console.error('Error fetching context for AI reply:', e);
    }
  }

  const accountRisk = await fetchAccountRisk();
  const latestSignal = signals.length > 0 ? signals[signals.length - 1].content : 'Belum ada sinyal.';

  const prompt = `
    Anda adalah asisten trading crypto cerdas (Crypto Sentinel).
    Gaya Trading Pengguna: HEDGING RECOVERY MODE. Pengguna MEMINIMALKAN CUT LOSS dan lebih memilih melakukan Hedging (membuka posisi Long dan Short bersamaan) untuk melakukan recovery pada posisi yang sedang floating loss.

    Data Akun & Risiko (PENTING):
    - Margin Ratio: ${accountRisk ? accountRisk.marginRatio.toFixed(2) + '%' : 'N/A'} (Maksimal Aman: 25%)
    - Saldo Wallet: $${accountRisk ? accountRisk.walletBalance.toFixed(2) : 'N/A'}
    - Margin Tersedia: $${accountRisk ? accountRisk.marginAvailable.toFixed(2) : 'N/A'}
    - PnL Belum Terealisasi: $${accountRisk ? accountRisk.unrealizedPnl.toFixed(2) : 'N/A'}
    - PnL Terealisasi (24j): $${accountRisk ? accountRisk.dailyRealizedPnl.toFixed(2) : 'N/A'}

    ATURAN MANAJEMEN RISIKO (WAJIB DIPATUHI):
    - JANGAN menyarankan posisi BARU jika Margin Ratio saat ini > 25%, kecuali untuk tujuan Hedging penyelamatan darurat.
    - Jika Margin Ratio > 25%, fokuskan saran pada pengurangan risiko.

    Data Pasar & Indikator Teknikal (1H timeframe):
    ${JSON.stringify(marketData, null, 2)}
    
    Posisi Terbuka (Hedging):
    ${JSON.stringify(positions.map((p: any) => ({symbol: p.symbol, side: p.side, size: p.contracts, entryPrice: p.entryPrice, pnl: p.unrealizedPnl})), null, 2)}
    
    Data Hedging Recovery (Net BEP):
    ${JSON.stringify(hedgingRecovery, null, 2)}
    
    Order Terbuka:
    ${JSON.stringify(openOrders.map((o: any) => ({symbol: o.symbol, side: o.side, type: o.type, price: o.price})), null, 2)}
    
    Analisis Terakhir Anda: ${latestSignal}

    Pengguna bertanya/berkata: "${userMessage}"

    Berikan jawaban yang membantu, ringkas, dan relevan dengan konteks trading di atas. Gunakan Bahasa Indonesia.
    
    KONSEP UTAMA (WAJIB DIPAHAMI):
    Strategi Recovery ini menggunakan konsep "Rasio 2:1 Searah Tren".
    - Jika posisi sedang Locking (Long = Short) dan mengalami Floating Loss:
      - Cek Tren (RangeFilter).
      - PRIORITASKAN "REDUCE" (Kurangi Lawan Tren 50%) JIKA:
        1. Posisi Lawan Tren sedang PROFIT (Hijau). Ambil profitnya!
        2. Margin Ratio > 15% (Hemat Margin).
      - HANYA PILIH "ADD" (Tambah Searah Tren) JIKA:
        1. Margin Ratio < 15% (Aman).
        2. Posisi Lawan Tren sedang LOSS (Merah) dan sayang jika dicut.
    
    PENGGANTI STOP LOSS (STOP HEDGE):
    - Dalam mode recovery ini, KITA TIDAK MENGGUNAKAN STOP LOSS KONVENSIONAL.
    - Pengganti Stop Loss adalah KEMBALI KE MODE LOCKING 1:1 (NEUTRAL).
    - Jika harga bergerak berlawanan dengan prediksi tren kita, segera sarankan untuk MENAMBAH posisi yang tertinggal agar rasio kembali 1:1 (Locking Total).
    
    Jika pengguna bertanya tentang posisi mereka, berikan saran spesifik untuk kaki Long dan Short sesuai strategi 2:1 di atas.
    Jadikan indikator "RangeFilter" sebagai acuan UTAMA Anda untuk melihat tren.
    
    STRUKTUR JAWABAN WAJIB (Jika memberikan rekomendasi):
    1. Analisis Margin & Tren: Sebutkan Margin Ratio dan Tren saat ini.
    2. Rencana Eksekusi: Jelaskan aksi (ADD/REDUCE) dan jumlah unitnya.
    3. Titik Harga Masuk (SMC):
       - Sebutkan Area Entry Ideal berdasarkan FVG (Fair Value Gap) atau Order Block (OB).
       - Berikan angka harga spesifik.
    4. Manajemen Risiko (Stop Hedge):
       - Tentukan "Harga Stop Hedge" (Titik Invalidation).
       - Jelaskan aksi jika harga menyentuh titik ini (misal: "Lock Kembali ke 1:1").
    
    Format dalam PLAIN TEXT, gunakan emoji secukupnya. JANGAN gunakan Markdown (tanpa bintang, tanpa garis bawah).
  `;

  try {
    const reply = await generateWithRetry(prompt, 'gemini-3-flash-preview');
    return reply || 'Maaf, saya tidak dapat memproses permintaan Anda saat ini.';
  } catch (error: any) {
    console.error('AI Reply Error:', error);
    return 'Maaf, terjadi kesalahan saat menghubungi AI (Sistem sedang sibuk, silakan coba lagi beberapa saat).';
  }
}

app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });
    const reply = await generateAiReply(message);
    res.json({ reply });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders', async (req, res) => {
  if (!BINANCE_API_KEY || !BINANCE_API_SECRET) {
    return res.status(400).json({ error: 'Binance API keys not configured' });
  }
  try {
    const openOrders = await binance.fetchOpenOrders();
    res.json(openOrders);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/market', async (req, res) => {
  try {
    const btc = await binance.fetchTicker('BTC/USDT');
    const eth = await binance.fetchTicker('ETH/USDT');
    res.json({
      BTC: btc,
      ETH: eth,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  let lastUpdateId = 0;
  let isPollingActive = false;
  const POLLING_ID = Math.random().toString(36).substring(7);

  async function executeTrade(symbol: string, action: string, percentage: number, targetPrice?: number, stopHedgePrice?: number) {
    if (!BINANCE_API_KEY || !BINANCE_API_SECRET) return "❌ API Keys missing.";
    try {
        // Robust symbol matching for Binance Futures
        const base = symbol.split('/')[0].split(':')[0];
        const fullSymbol = `${base}/USDT:USDT`;
        
        // 1. Fetch Price
        const ticker = await binance.fetchTicker(fullSymbol);
        const currentPrice = ticker.last;
        if (!currentPrice) throw new Error("Could not fetch price");

        // 2. Detect Position Mode (Hedge vs One-Way)
        const positions = await binance.fetchPositions();
        const hasHedgeMode = positions.some((p: any) => p.side === 'long' || p.side === 'short');
        
        let side: 'buy' | 'sell' | undefined;
        let positionSide: 'LONG' | 'SHORT' | 'BOTH' | undefined;
        let quantity = 0;
        let msgAction = '';
        let executionType = targetPrice ? 'LIMIT' : 'MARKET';

        // 3. Determine Side, PositionSide & Quantity
        if (action === 'REDUCE_LONG' || action === 'RL') {
            const pos = positions.find((p: any) => p.symbol === fullSymbol && (hasHedgeMode ? p.side === 'long' : true) && p.contracts > 0);
            if (!pos) return `❌ No LONG position to reduce for ${fullSymbol}`;
            side = 'sell';
            positionSide = hasHedgeMode ? 'LONG' : 'BOTH';
            quantity = pos.contracts * (percentage / 100);
            msgAction = `Reducing LONG by ${percentage}%`;
        } else if (action === 'REDUCE_SHORT' || action === 'RS') {
            const pos = positions.find((p: any) => p.symbol === fullSymbol && (hasHedgeMode ? p.side === 'short' : true) && p.contracts > 0);
            if (!pos) return `❌ No SHORT position to reduce for ${fullSymbol}`;
            side = 'buy';
            positionSide = hasHedgeMode ? 'SHORT' : 'BOTH';
            quantity = pos.contracts * (percentage / 100);
            msgAction = `Reducing SHORT by ${percentage}%`;
        } else if (action === 'ADD_LONG' || action === 'AL') {
            side = 'buy';
            positionSide = hasHedgeMode ? 'LONG' : 'BOTH';
            quantity = 15 / (targetPrice || currentPrice);
            msgAction = `Adding to LONG (15 USDT)`;
        } else if (action === 'ADD_SHORT' || action === 'AS') {
            side = 'sell';
            positionSide = hasHedgeMode ? 'SHORT' : 'BOTH';
            quantity = 15 / (targetPrice || currentPrice);
            msgAction = `Adding to SHORT (15 USDT)`;
        } else if (action === 'LOCK_NEUTRAL' || action === 'LN') {
            // Find both positions to calculate the difference
            const longPos = positions.find((p: any) => p.symbol === fullSymbol && (hasHedgeMode ? p.side === 'long' : true) && p.contracts > 0);
            const shortPos = positions.find((p: any) => p.symbol === fullSymbol && (hasHedgeMode ? p.side === 'short' : true) && p.contracts > 0);
            
            const longQty = longPos ? longPos.contracts : 0;
            const shortQty = shortPos ? shortPos.contracts : 0;
            
            if (longQty > shortQty) {
                // Net Long -> Need to add Short to balance
                side = 'sell';
                positionSide = hasHedgeMode ? 'SHORT' : 'BOTH';
                quantity = longQty - shortQty;
                msgAction = `Locking Neutral: Adding SHORT to balance LONG`;
            } else if (shortQty > longQty) {
                // Net Short -> Need to add Long to balance
                side = 'buy';
                positionSide = hasHedgeMode ? 'LONG' : 'BOTH';
                quantity = shortQty - longQty;
                msgAction = `Locking Neutral: Adding LONG to balance SHORT`;
            } else {
                return `❌ Position is already 1:1 Neutral.`;
            }
        } else {
            return `❌ Unknown action: ${action}`;
        }

        if (!side || !positionSide) return "❌ Invalid side or positionSide determined.";

        // Round quantity to 4 decimal places to avoid precision errors
        quantity = parseFloat(quantity.toFixed(4));
        if (quantity <= 0) return "❌ Quantity too small.";

        // 4. Execute Primary Order
        let order;
        // Only send positionSide if in Hedge Mode, otherwise Binance might reject
        const orderParams: any = {};
        if (hasHedgeMode) {
            orderParams.positionSide = positionSide;
        }
        
        if (targetPrice) {
            order = await binance.createLimitOrder(fullSymbol, side, quantity, targetPrice, orderParams);
        } else {
            order = await binance.createMarketOrder(fullSymbol, side, quantity, orderParams);
        }
        
        let responseMsg = `✅ <b>${executionType} ORDER SUCCESS!</b>\n\n${msgAction}\nSymbol: ${fullSymbol}\nQty: ${order.amount}\nPrice: ${order.price || order.average || currentPrice}`;

        // 5. Automated Stop Hedging (Lock Kembali)
        if (stopHedgePrice) {
            try {
                const stopSide = side === 'buy' ? 'sell' : 'buy';
                const stopParams: any = {
                    stopPrice: stopHedgePrice
                };
                
                if (hasHedgeMode) {
                    stopParams.positionSide = positionSide === 'LONG' ? 'SHORT' : 'LONG';
                }
                
                await binance.createOrder(fullSymbol, 'STOP_MARKET', stopSide, quantity, undefined, stopParams);
                
                responseMsg += `\n\n🛡️ <b>STOP HEDGE PLACED!</b>\nPrice: ${stopHedgePrice}\nSide: ${stopSide.toUpperCase()}\nQty: ${quantity.toFixed(4)}`;
            } catch (stopErr: any) {
                console.error("Stop Hedge Error:", stopErr);
                responseMsg += `\n\n⚠️ <b>Stop Hedge Failed:</b> ${stopErr.message}`;
            }
        }
        
        return responseMsg;
    } catch (e: any) {
        console.error("Trade Execution Error:", e);
        return `❌ <b>EXECUTION FAILED</b>\n\n${e.message}`;
    }
  }

async function pollTelegram() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  if (isPollingActive) {
    return;
  }
  
  isPollingActive = true;
  try {
    // Reduced timeout to 10s to avoid 409 overlaps
    const res = await axios.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=10`);
    const updates = res.data.result;
    if (updates && updates.length > 0) {
      for (const update of updates) {
        lastUpdateId = update.update_id;
        
        // Handle Callback Queries (Button Clicks)
        if (update.callback_query) {
            const callback = update.callback_query;
            const rawData = callback.data; // "a|s|p|tp|sh"
            const parts = rawData.split('|');
            
            const data = {
                a: parts[0],
                s: parts[1],
                p: parseInt(parts[2]),
                tp: parts[3] ? parseFloat(parts[3]) : undefined,
                sh: parts[4] ? parseFloat(parts[4]) : undefined
            };
            
            // Acknowledge callback to stop loading animation
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
                callback_query_id: callback.id,
                text: `Processing ${data.a} on ${data.s}...`
            });

            // Execute Trade with Target Price and Stop Hedge
            const resultMsg = await executeTrade(data.s, data.a, data.p, data.tp, data.sh);
            
            // Send Result
            await sendTelegramMessage(resultMsg);
        }

        // Handle Text Messages
        if (update.message && update.message.text) {
          const chatId = update.message.chat.id.toString();
          if (chatId === TELEGRAM_CHAT_ID) {
            const userText = update.message.text;
            
            // Send typing action
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendChatAction`, {
              chat_id: TELEGRAM_CHAT_ID,
              action: 'typing'
            }).catch(() => {});
            
            const reply = await generateAiReply(userText);
            await sendTelegramMessage(`🤖 AI Reply:\n\n${reply}`);
          }
        }
      }
    }
  } catch (error: any) {
    const errorBody = error.response?.data;
    // Only log non-409 errors to reduce noise, or log 409 briefly
    if (error.response && error.response.status === 409) {
        console.log(`⚠️ [ID:${POLLING_ID}] Polling Conflict (409). Another instance might be running. Backing off...`);
        // Handle 409 Conflict: Webhook is active or other instance polling
        try {
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook`, {
                drop_pending_updates: true
            });
            // Randomized wait to break sync with other instances (longer wait)
            const waitTime = 30000 + Math.floor(Math.random() * 30000);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        } catch (webhookError: any) {
            // Ignore webhook deletion errors during conflict
        }
    } else {
        console.error(`[ID:${POLLING_ID}] Polling Error:`, error.message, errorBody ? JSON.stringify(errorBody) : "");
    }
  } finally {
    isPollingActive = false;
  }
  // Ensure polling continues even after error, but wait a bit
  setTimeout(pollTelegram, 3000);
}

app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Ensure webhook is deleted before starting polling to avoid 409 Conflict
    if (TELEGRAM_BOT_TOKEN) {
        let webhookDeleted = false;
        let attempts = 0;
        while (!webhookDeleted && attempts < 5) {
            try {
                attempts++;
                console.log(`Attempting to delete webhook (Attempt ${attempts}/5)...`);
                // Force delete webhook and drop pending updates to clear any stuck state
                await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook`, {
                    drop_pending_updates: true
                });
                console.log("✅ Webhook deleted on startup.");
                webhookDeleted = true;
            } catch (e: any) {
                console.error(`Failed to delete webhook on startup (Attempt ${attempts}/5):`, e.message);
                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, 2000 * attempts));
            }
        }
        
        if (!webhookDeleted) {
            console.error("❌ CRITICAL: Failed to delete webhook after multiple attempts. Polling might fail with 409 Conflict.");
        } else {
            // Wait a bit more to ensure Telegram servers propagate the change
            console.log("Waiting 5 seconds for webhook deletion to propagate...");
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    
    pollTelegram();
  });
}

startServer();