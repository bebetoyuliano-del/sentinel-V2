import { normalizeSymbolInput } from './Symbol';

export function normalizeActionInput(rawAction: string): { action: string, extractedSymbol?: string, extractedPercentage?: number, extractedTargetPrice?: number, extractedQty?: number } {
    let s = rawAction.toUpperCase().replace(/,/g, '.').replace(/\//g, ' ').trim();
    
    // 1. Extract percentage (e.g. "50%")
    let extractedPercentage: number | undefined = undefined;
    const pctMatch = s.match(/(\d+)%/);
    if (pctMatch) {
        extractedPercentage = parseInt(pctMatch[1], 10);
        s = s.replace(/(\d+)%/, ' ').trim();
    }

    // 2. Extract targetPrice (decimal or 4+ digits)
    let extractedTargetPrice: number | undefined = undefined;
    const priceRegex = /(?:UP TO|AT|@|:)?\s*(\d+\.\d+|\d{4,})(?:\s|[:!,;]|$)?/i;
    const priceMatch = s.match(priceRegex);
    if (priceMatch) {
        extractedTargetPrice = parseFloat(priceMatch[1]);
        s = s.replace(priceRegex, ' ').trim();
    }

    // 3. Find Action
    const aliasMap: Record<string, string> = {
        'TAKE PROFIT': 'TP',
        'TAKE_PROFIT': 'TP',
        'REDUCE LONG': 'RL',
        'REDUCE_LONG': 'RL',
        'REDUCE SHORT': 'RS',
        'REDUCE_SHORT': 'RS',
        'ADD LONG': 'AL',
        'ADD_LONG': 'AL',
        'ADD SHORT': 'AS',
        'ADD_SHORT': 'AS',
        'HEDGE ON': 'HO',
        'HEDGE_ON': 'HO',
        'LOCK NEUTRAL': 'LN',
        'LOCK_NEUTRAL': 'LN',
        'UNLOCK': 'UL',
        'ROLE': 'RR',
        'HOLD': 'HOLD',
        'BUY': 'AL',
        'SELL': 'AS',
        'TP': 'TP',
        'RL': 'RL',
        'RS': 'RS',
        'AL': 'AL',
        'AS': 'AS',
        'HO': 'HO',
        'LN': 'LN',
        'UL': 'UL',
        'RR': 'RR'
    };

    let action = "";
    const sortedAliases = Object.keys(aliasMap).sort((a, b) => b.length - a.length);
    for (const alias of sortedAliases) {
        // Use word boundary to avoid matching inside other words (e.g., "AL" in "ANALISA")
        const regex = new RegExp(`\\b${alias.replace(/ /g, '\\s+')}\\b`, 'i');
        if (regex.test(s)) {
            action = aliasMap[alias];
            s = s.replace(regex, ' ').trim();
            break;
        }
    }

    // 4. Find Symbol (look for something like BTC/USDT or BTCUSDT)
    let extractedSymbol: string | undefined = undefined;
    const symbolMatch = s.match(/([A-Z0-9]{2,10}\/[A-Z0-9]{2,10}|[A-Z0-9]{5,15}USDT|[A-Z0-9]{2,10}:[A-Z0-9]{2,10})/);
    if (symbolMatch) {
        extractedSymbol = normalizeSymbolInput(symbolMatch[1]);
        s = s.replace(symbolMatch[0], ' ').trim();
    } else {
        // Fallback: any remaining word that looks like a symbol (e.g., "BTC")
        const fallbackMatch = s.match(/\b([A-Z]{2,10})\b/);
        if (fallbackMatch && !['UP','TO','AT','USDT'].includes(fallbackMatch[1])) {
            extractedSymbol = normalizeSymbolInput(fallbackMatch[1]);
            s = s.replace(fallbackMatch[1], ' ').trim();
        }
    }

    // 5. Extract fixed quantity
    let extractedQty: number | undefined = undefined;
    if (!extractedPercentage) {
        const qtyMatch = s.match(/(\d+(?:\.\d+)?)/);
        if (qtyMatch) {
            extractedQty = parseFloat(qtyMatch[1]);
            s = s.replace(qtyMatch[1], ' ').trim();
        }
    }

    // 6. If still no percentage, check if any remaining number looks like one
    if (!extractedPercentage && !extractedQty) {
        const numMatch = s.match(/(\d+)/);
        if (numMatch) {
            const val = parseInt(numMatch[1], 10);
            if ([10, 15, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 100].includes(val)) {
                extractedPercentage = val;
            }
        }
    }

    return { action, extractedSymbol, extractedPercentage, extractedTargetPrice, extractedQty };
}

export function buildCallbackData(params: { action: string, symbol: string, percentage?: number, targetPrice?: number, stopHedgePrice?: number }): string {
    const a = params.action;
    const s = normalizeSymbolInput(params.symbol);
    const pct = params.percentage || 100;
    const tp = params.targetPrice ? params.targetPrice.toString() : '';
    const sh = params.stopHedgePrice ? params.stopHedgePrice.toString() : '';
    
    return `${a}|${s}|${pct}|${tp}|${sh}`;
}

export function parseTelegramCallbackData(data: string): { action?: string, symbol?: string, percentage?: number, targetPrice?: number, stopHedgePrice?: number } {
    if (data.includes('|')) {
        const parts = data.split('|');
        return {
            action: parts[0],
            symbol: normalizeSymbolInput(parts[1]),
            percentage: parseInt(parts[2], 10) || 100,
            targetPrice: parts[3] ? parseFloat(parts[3]) : undefined,
            stopHedgePrice: parts[4] ? parseFloat(parts[4]) : undefined
        };
    }

    const norm = normalizeActionInput(data);
    return {
        action: norm.action,
        symbol: norm.extractedSymbol,
        percentage: norm.extractedPercentage || 100
    };
}

export function deriveActionRiskType(action?: string, mrDelta?: number | null) {
  if (!action) return 'NEUTRAL';
  const A = action.toUpperCase();
  if (A.startsWith('LOCK')) return 'LOCK';
  if (A.startsWith('TAKE')) return 'DE_RISK';
  if (A.startsWith('ADD') || A === 'HEDGE_ON' || A === 'ROLE') return 'EXPAND';
  if (typeof mrDelta === 'number') return mrDelta < 0 ? 'DE_RISK' : (mrDelta > 0 ? 'EXPAND' : 'NEUTRAL');
  return 'NEUTRAL';
}

export function deriveRiskTag(accountMrDecimal?: number | null, mrDelta?: number | null): 'CRITICAL'|'HIGH'|'NORMAL'|'LOW'|'' {
  if (accountMrDecimal == null) return '';
  if (accountMrDecimal >= 0.60) return 'CRITICAL';
  if (accountMrDecimal >= 0.25) return 'HIGH';
  if (typeof mrDelta === 'number' && mrDelta > 0) return 'HIGH';
  if (accountMrDecimal < 0.15) return 'LOW';
  return 'NORMAL';
}
