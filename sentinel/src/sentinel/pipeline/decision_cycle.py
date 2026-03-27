from typing import Dict, Any, Callable, Optional
import numpy as np
import uuid
from ..types import MarketSnapshot, PolicyOutput
from ..hmm.models import HMMState, HMMParams
from ..config import SentinelConfig
from ..features.engineering import feature_engineering
from ..execution.microstructure import microstructure_guard
from ..hmm.filter import hmm_forward_filter
from ..policy.regime_policy import map_regime_to_policy
from ..policy.sop_guards import sop_structural_gates, sop_golden_rule_enforcer
from ..journal.writer import journal_write

def _compute_state_confidence(gamma_t: np.ndarray) -> float:
    """Computes an entropy-based confidence score [0.0, 1.0]."""
    probs = np.clip(gamma_t, 1e-9, 1.0)
    probs = probs / np.sum(probs)
    entropy = -np.sum(probs * np.log(probs))
    max_entropy = np.log(len(probs))
    if max_entropy == 0: return 1.0
    return max(0.0, 1.0 - (entropy / max_entropy))

def sentinel_decision_cycle(
    snapshot: MarketSnapshot,
    hmm_state: HMMState,
    hmm_params: HMMParams,
    portfolio_ctx: Dict[str, Any],
    cfg: SentinelConfig,
    mr_projected_callback: Callable[[str, Optional[str], Optional[float]], float],
    decision_card: Dict[str, Any]
) -> Dict[str, Any]:
    """
    The main orchestrator preserving exact ordering of logic.
    """
    # 1. Features
    features = feature_engineering(snapshot)
    
    # 2. Microstructure
    micro_throttle, micro_flags = microstructure_guard(snapshot, cfg)
    
    # 3. HMM Filter
    hmm_state = hmm_forward_filter(features, hmm_state, hmm_params, max_buffer_window=cfg.hmm.max_buffer_window)
    
    # 4. Normalize & Stabilize (handled inside filter)
    normalized_regime_probs = hmm_state.gamma_t
    
    # 5. Regime Policy
    policy = map_regime_to_policy(normalized_regime_probs, cfg, portfolio_ctx)
    action_original = decision_card.get("Action", "HOLD")
    
    # 6. MR Hard Guard
    current_mr = portfolio_ctx.get("margin_ratio", 0.0)
    if current_mr >= cfg.sop.max_mr_hard_guard:
        policy.ActionSuggested = "LOCK_NEUTRAL"
        policy.RiskMultiplier = 0.0
        policy.Diagnostics["hard_guard"] = "MR_EXCEEDED"
        
    # 7. Target Size Estimate Injection (PATCH 3)
    base_capital = portfolio_ctx.get("base_capital", 1000.0)
    target_size_estimate = base_capital * policy.RiskMultiplier * micro_throttle
    portfolio_ctx["target_size_estimate"] = target_size_estimate
    
    # Extract ContextMode and TrendStatus from decision_card
    if "ContextMode" in decision_card:
        portfolio_ctx["ContextMode"] = decision_card["ContextMode"]
    if "TrendStatus" in decision_card:
        portfolio_ctx["TrendStatus"] = decision_card["TrendStatus"]
    
    # 8. SOP Gates
    gates = sop_structural_gates(portfolio_ctx, cfg)
    
    # 9. SOP Enforcer (PATCH 1 & 2 inside)
    policy = sop_golden_rule_enforcer(
        policy=policy,
        portfolio_ctx=portfolio_ctx,
        gates=gates,
        mr_projected_if_action=mr_projected_callback,
        cfg=cfg
    )
    
    # Merge diagnostics
    policy.Diagnostics.update(micro_flags)
    policy.Diagnostics["LogL"] = hmm_state.logL
    policy.Diagnostics["StateConfidence"] = _compute_state_confidence(hmm_state.gamma_t)
    
    # 10. Final Sizing
    final_size = base_capital * policy.RiskMultiplier * micro_throttle
    
    tca_ref_id = decision_card.get("tca_ref_id", str(uuid.uuid4()))
    
    # 11. Journaling
    journal_write(
        ts=snapshot.ts,
        symbol=snapshot.symbol,
        action_original=action_original,
        action_suggested=policy.ActionSuggested,
        margin_ratio=current_mr,
        regime_probs=policy.RegimeProb,
        reason=policy.Reason,
        microstructure_flags=micro_flags,
        tca_ref_id=tca_ref_id
    )
    
    # 12. Return
    return {
        "ActionOriginal": action_original,
        "ActionSuggested": policy.ActionSuggested,
        "RiskMultiplier": policy.RiskMultiplier,
        "TargetSize": final_size,
        "RegimeProb": policy.RegimeProb,
        "Reason": policy.Reason,
        "Diagnostics": policy.Diagnostics
    }
