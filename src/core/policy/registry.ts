import { GlobalPolicy, SymbolPolicy } from './validator';

/**
 * In-memory state holder for policies.
 * This is a singleton-like object that stores the current active policies.
 */
let globalPolicy: GlobalPolicy | null = null;
const symbolPolicies: Map<string, SymbolPolicy> = new Map();

export const PolicyRegistry = {
  /**
   * Sets the global policy in the registry.
   */
  setGlobalPolicy(policy: GlobalPolicy): void {
    globalPolicy = policy;
  },

  /**
   * Gets the global policy from the registry.
   */
  getGlobalPolicy(): GlobalPolicy | null {
    return globalPolicy;
  },

  /**
   * Sets a symbol-specific policy in the registry.
   */
  setSymbolPolicy(symbol: string, policy: SymbolPolicy): void {
    symbolPolicies.set(symbol, policy);
  },

  /**
   * Gets a symbol-specific policy from the registry.
   */
  getSymbolPolicy(symbol: string): SymbolPolicy | null {
    return symbolPolicies.get(symbol) || null;
  },

  /**
   * Clears the registry (useful for testing or full reloads).
   */
  clear(): void {
    globalPolicy = null;
    symbolPolicies.clear();
  },

  /**
   * Returns all symbol-specific policies.
   */
  getAllSymbolPolicies(): SymbolPolicy[] {
    return Array.from(symbolPolicies.values());
  }
};
