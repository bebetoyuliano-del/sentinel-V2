import { PolicyRegistry } from './registry';
import { GlobalPolicy, SymbolPolicy } from './validator';

/**
 * Pure read-only getters from the Policy Registry.
 * These are used by the application to access the current policy state.
 */
export const PolicySelectors = {
  /**
   * Gets the current global policy.
   * Throws if the policy has not been initialized.
   */
  getGlobalPolicy(): GlobalPolicy {
    const policy = PolicyRegistry.getGlobalPolicy();
    if (!policy) {
      throw new Error("[PolicySelectors] Global Policy not initialized. Call bootstrapPolicies() first.");
    }
    return policy;
  },

  /**
   * Gets the policy for a specific symbol.
   * Falls back to hardcoded defaults if no specific policy is found.
   */
  getPolicyForSymbol(symbol: string): SymbolPolicy {
    const policy = PolicyRegistry.getSymbolPolicy(symbol);
    if (policy) {
      return policy;
    }

    // Fallback to hardcoded defaults (matching server.ts baseline)
    return {
      symbol,
      timeframe: '4h',
      takeProfitPct: 4.0,
      lock11Mode: true,
      lockTriggerPct: 2.0,
      add05Mode: true,
      structure21Mode: false,
      maxMrPct: 25.0
    };
  },

  /**
   * Gets all approved settings (symbol-specific policies).
   */
  getAllApprovedSettings(): SymbolPolicy[] {
    return PolicyRegistry.getAllSymbolPolicies();
  }
};
