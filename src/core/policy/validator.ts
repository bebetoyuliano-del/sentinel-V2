export interface GlobalPolicy {
  params: {
    k_atr: number;
    unlock_buffer_atr: number;
    vwap_delta_pct: number;
    time_stop_hedge_bars_h1: number;
    hedge_ratio: number;
    mr_guard_pct: number;
  };
  enable_addendum_modules: string[];
}

export interface SymbolPolicy {
  symbol: string;
  timeframe: string;
  takeProfitPct: number;
  lock11Mode: boolean;
  lockTriggerPct: number;
  add05Mode: boolean;
  structure21Mode: boolean;
  maxMrPct: number;
}

/**
 * Validates the shape of the Global Policy.
 * Throws if invalid.
 */
export function validateGlobalPolicy(policy: any): GlobalPolicy {
  if (!policy || !policy.params) {
    throw new Error("Invalid Global Policy: Missing params");
  }
  
  const requiredParams = [
    'k_atr', 'unlock_buffer_atr', 'vwap_delta_pct', 
    'time_stop_hedge_bars_h1', 'hedge_ratio', 'mr_guard_pct'
  ];
  
  for (const param of requiredParams) {
    if (typeof policy.params[param] !== 'number') {
      throw new Error(`Invalid Global Policy: Param ${param} must be a number`);
    }
  }
  
  if (!Array.isArray(policy.enable_addendum_modules)) {
    throw new Error("Invalid Global Policy: enable_addendum_modules must be an array");
  }
  
  return policy as GlobalPolicy;
}

/**
 * Validates the shape of a Symbol-Specific Policy.
 * Throws if invalid.
 */
export function validateSymbolPolicy(policy: any): SymbolPolicy {
  if (!policy || !policy.symbol) {
    throw new Error("Invalid Symbol Policy: Missing symbol");
  }
  
  if (typeof policy.takeProfitPct !== 'number') {
    throw new Error("Invalid Symbol Policy: takeProfitPct must be a number");
  }
  
  return policy as SymbolPolicy;
}
