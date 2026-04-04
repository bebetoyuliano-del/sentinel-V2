import { GlobalPolicy, SymbolPolicy } from './validator';

/**
 * Loads the source policy that is approved.
 * In Phase 4A-0, this loads the hardcoded baseline values.
 */
export async function loadInitialPolicies(): Promise<{ global: GlobalPolicy; symbols: SymbolPolicy[] }> {
  // Baseline Global Policy (matching server.ts current hardcoded values)
  const global: GlobalPolicy = {
    params: {
      k_atr: 0.50,
      unlock_buffer_atr: 0.25,
      vwap_delta_pct: 0.10,
      time_stop_hedge_bars_h1: 6,
      hedge_ratio: 2.0,
      mr_guard_pct: 25.0
    },
    enable_addendum_modules: ["HEDGE_NORMALIZATION_V2", "HEDGING_RECOVERY_BY_ZONE"]
  };

  // Baseline Symbol Policies (empty for now, as they are dynamic in server.ts)
  const symbols: SymbolPolicy[] = [];

  return { global, symbols };
}
