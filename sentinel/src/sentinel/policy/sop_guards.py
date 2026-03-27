from typing import Dict, Any, Callable, Optional
from ..types import PolicyOutput
from ..config import SentinelConfig
from ..utils.math_utils import is_nan

def is_green(pnl_float: Optional[float]) -> bool:
    """NaN safe check for positive PnL."""
    if pnl_float is None or is_nan(pnl_float):
        return False
    return pnl_float > 0.0

def compute_bep_2to1(long_qty: float, long_entry: float, short_qty: float, short_entry: float) -> float:
    """
    Computes Break-Even Price using the exact frozen formula:
    BEP = ((Qty_Long * Entry_Long) - (Qty_Short * Entry_Short)) / (Qty_Long - Qty_Short)
    """
    denominator = long_qty - short_qty
    if denominator == 0:
        return 0.0 
    return ((long_qty * long_entry) - (short_qty * short_entry)) / denominator

def sop_structural_gates(portfolio_ctx: Dict[str, Any], cfg: SentinelConfig) -> Dict[str, Any]:
    """
    Computes structural gates based on portfolio context and config.
    """
    long_pnl = portfolio_ctx.get("long_pnl", 0.0)
    short_pnl = portfolio_ctx.get("short_pnl", 0.0)
    margin_ratio = portfolio_ctx.get("margin_ratio", 0.0)
    is_locked_1to1 = portfolio_ctx.get("is_locked_1to1", False)
    spot_move_against_pct = portfolio_ctx.get("spot_move_against_pct", 0.0)
    
    bias4h = portfolio_ctx.get("Bias4H", "FLAT") 
    bias1h = portfolio_ctx.get("Bias1H", "FLAT")
    trend_status = portfolio_ctx.get("TrendStatus", "UNCLEAR")
    context_mode = portfolio_ctx.get("ContextMode", "LOCK_WAIT_SEE")
    
    long_green = is_green(long_pnl)
    short_green = is_green(short_pnl)
    
    bias_compact = (bias4h == bias1h) and (bias4h in {"UP", "DOWN"})
    
    must_lock = is_locked_1to1 or (spot_move_against_pct > cfg.sop.spot_move_lock_trigger_pct)
    
    # Ambiguous, Chop, or Reversal Watch blocks expansion
    is_ambiguous = trend_status == "UNCLEAR" or context_mode in {"LOCK_WAIT_SEE", "RISK_DENIED"}
    is_chop = trend_status == "CHOP" or context_mode == "RECOVERY_SUSPENDED"
    is_reversal_watch = trend_status == "REVERSAL_WATCH"
    
    can_expand = (not must_lock) and (margin_ratio < 0.15) and bias_compact and not is_ambiguous and not is_chop and not is_reversal_watch
    
    add_half_hint = None
    if can_expand:
        if bias4h == "UP":
            add_half_hint = "ADD_0.5_LONG"
        elif bias4h == "DOWN":
            add_half_hint = "ADD_0.5_SHORT"
            
    return {
        "long_green": long_green,
        "short_green": short_green,
        "bias_compact": bias_compact,
        "must_lock": must_lock,
        "can_expand": can_expand,
        "add_half_hint": add_half_hint,
        "prefer_reduce_profit_leg": True,
        "disallow_reduce_red_leg": True,
    }

def sop_golden_rule_enforcer(
    policy: PolicyOutput, 
    portfolio_ctx: Dict[str, Any],
    gates: Dict[str, Any],
    mr_projected_if_action: Callable[[str, Optional[str], Optional[float]], float],
    cfg: SentinelConfig
) -> PolicyOutput:
    """
    Enforces the absolute SOP rules, including final approval patches.
    """
    final_action = policy.ActionSuggested
    final_rm = policy.RiskMultiplier
    diagnostics = policy.Diagnostics.copy()
    
    must_lock = gates.get("must_lock", False)
    can_expand = gates.get("can_expand", False)
    add_half_hint = gates.get("add_half_hint", None)
    disallow_reduce_red_leg = gates.get("disallow_reduce_red_leg", True)

    target_size = portfolio_ctx.get("target_size_estimate", 0.0)
    structure_ratio = portfolio_ctx.get("structure_ratio", "")
    trend_status = portfolio_ctx.get("TrendStatus", "UNCLEAR")
    context_mode = portfolio_ctx.get("ContextMode", "LOCK_WAIT_SEE")
    
    # PATCH 1: must_lock allows only defensive actions and caps RM
    allowed_defensive = {"LOCK_NEUTRAL", "HOLD", "TAKE_PROFIT", "REDUCE_LONG", "REDUCE_SHORT"}
    if must_lock:
        if final_action not in allowed_defensive:
            final_action = "HOLD"
        final_rm = min(final_rm, 0.3)
        diagnostics["SizingHint"] = "LOCK_WAIT_SEE"
        
    # CHOP / DEAD MARKET Filter: only defensive actions allowed
    if trend_status == "CHOP" or context_mode == "RECOVERY_SUSPENDED":
        if final_action not in allowed_defensive:
            final_action = "HOLD"
            diagnostics["blocked_by"] = "chop_dead_market_filter"
            
    # Golden Rule: No reduce on red leg
    if disallow_reduce_red_leg:
        if final_action == "REDUCE_LONG" and not gates.get("long_green", False):
            final_action = "HOLD"
            diagnostics["blocked_by"] = "no_reduce_on_red_long"
        if final_action == "REDUCE_SHORT" and not gates.get("short_green", False):
            final_action = "HOLD"
            diagnostics["blocked_by"] = "no_reduce_on_red_short"

    # Rule: Unlock only if hedge leg is green
    if final_action == "UNLOCK":
        if structure_ratio == "2:1_SHORT":
            hedge_is_green = gates.get("long_green", False)
        else:
            # Default to short as hedge for 2:1_LONG or unknown
            hedge_is_green = gates.get("short_green", False)
            
        if not hedge_is_green:
            final_action = "HOLD"
            diagnostics["blocked_by"] = "unlock_requires_green_hedge"

    # Add 0.5 logic
    trend_confirmed = policy.RegimeProb.get("Trend", 0.0) >= cfg.hmm.threshold_trend or final_action == "HEDGE_ON"
    if can_expand and add_half_hint and trend_confirmed:
        # Only assign if not already overridden by must_lock
        if diagnostics.get("SizingHint") != "LOCK_WAIT_SEE":
            diagnostics["SizingHint"] = add_half_hint

    sizing_hint = diagnostics.get("SizingHint")

    # PATCH 2: Projected MR blocking
    projected_mr = mr_projected_if_action(final_action, sizing_hint, target_size)
    diagnostics["mr_projected_checked"] = projected_mr
    
    if projected_mr > 0.25:
        diagnostics["risk_denied"] = True
        is_expansion_action = final_action in {"HEDGE_ON", "UNLOCK"}
        is_add_hint = sizing_hint in {"ADD_0.5_LONG", "ADD_0.5_SHORT"}
        
        if is_expansion_action or is_add_hint:
            final_action = "HOLD"
            final_rm = min(final_rm, 0.3)
            
            is_stress_regime = max(policy.RegimeProb, key=policy.RegimeProb.get) == "Stress"
            if is_stress_regime:
                final_action = "LOCK_NEUTRAL"
            
            if is_add_hint:
                diagnostics["SizingHintBlocked"] = sizing_hint
                diagnostics["SizingHint"] = "EXPANSION_BLOCKED_BY_MR"
                sizing_hint = "EXPANSION_BLOCKED_BY_MR"

    # Ensure SizingHint is present if it was determined
    if "SizingHint" not in diagnostics and sizing_hint:
        diagnostics["SizingHint"] = sizing_hint
        
    # BEP Rule
    if structure_ratio in {"2:1_LONG", "2:1_SHORT"}:
        bep = compute_bep_2to1(
            portfolio_ctx.get("long_qty", 0.0), portfolio_ctx.get("long_entry", 0.0),
            portfolio_ctx.get("short_qty", 0.0), portfolio_ctx.get("short_entry", 0.0)
        )
        diagnostics["BEPPrice"] = bep

    policy.ActionSuggested = final_action
    policy.RiskMultiplier = final_rm
    policy.Diagnostics = diagnostics
    return policy
