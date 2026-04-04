import { loadInitialPolicies } from './loader';
import { validateGlobalPolicy, validateSymbolPolicy } from './validator';
import { PolicyRegistry } from './registry';

/**
 * Bootstraps the policy system.
 * Orchestrates: load -> validate -> register.
 * Fail-fast if any policy is invalid.
 */
export async function bootstrapPolicies(): Promise<void> {
  try {
    console.log('[PolicyBootstrap] Starting policy initialization...');
    
    // 1. Load the initial policies from the source (loader)
    const { global, symbols } = await loadInitialPolicies();
    
    // 2. Validate the global policy
    const validatedGlobal = validateGlobalPolicy(global);
    
    // 3. Register the global policy
    PolicyRegistry.setGlobalPolicy(validatedGlobal);
    
    // 4. Validate and register each symbol-specific policy
    for (const sym of symbols) {
      const validatedSym = validateSymbolPolicy(sym);
      PolicyRegistry.setSymbolPolicy(validatedSym.symbol, validatedSym);
    }
    
    console.log('[PolicyBootstrap] Successfully initialized policies');
  } catch (error) {
    console.error('[PolicyBootstrap] Failed to initialize policies:', error);
    // Fail-fast: Throw the error to prevent the server from starting with invalid policies
    throw error;
  }
}
