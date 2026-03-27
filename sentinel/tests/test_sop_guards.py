import pytest
from src.sentinel.config import SentinelConfig
from src.sentinel.policy.sop_guards import sop_golden_rule_enforcer, compute_bep_2to1
from src.sentinel.types import PolicyOutput

def mock_mr_projected(action, sizing_hint=None, target_size=None):
    return 0.1

def test_compute_bep_2to1():
    bep = compute_bep_2to1(2.0, 100.0, 1.0, 90.0)
    assert bep == 110.0

def test_no_reduce_on_red_leg():
    cfg = SentinelConfig()
    policy = PolicyOutput(RegimeProb={"Normal": 1.0}, RiskMultiplier=0.5, ActionSuggested="REDUCE_LONG", Reason="")
    gates = {"must_lock": False, "disallow_reduce_red_leg": True, "long_green": False}
    portfolio_ctx = {"long_pnl": -10.0} # Red leg
    
    final_policy = sop_golden_rule_enforcer(policy, portfolio_ctx, gates, mock_mr_projected, cfg)
    assert final_policy.ActionSuggested == "HOLD"

def test_must_lock_allows_only_defensive():
    cfg = SentinelConfig()
    policy = PolicyOutput(RegimeProb={"Normal": 1.0}, RiskMultiplier=1.0, ActionSuggested="HEDGE_ON", Reason="")
    gates = {"must_lock": True}
    portfolio_ctx = {}
    
    final_policy = sop_golden_rule_enforcer(policy, portfolio_ctx, gates, mock_mr_projected, cfg)
    assert final_policy.ActionSuggested == "HOLD"
    assert final_policy.RiskMultiplier <= 0.3

def test_trend_can_expand_add_half_hint():
    cfg = SentinelConfig()
    policy = PolicyOutput(RegimeProb={"Trend": 0.7}, RiskMultiplier=1.0, ActionSuggested="HEDGE_ON", Reason="", Diagnostics={"SizingHint": "ADD_0.5_LONG"})
    gates = {"can_expand": True, "add_half_hint": "ADD_0.5_LONG"}
    portfolio_ctx = {}
    
    final_policy = sop_golden_rule_enforcer(policy, portfolio_ctx, gates, mock_mr_projected, cfg)
    assert final_policy.Diagnostics.get("SizingHint") == "ADD_0.5_LONG"

def test_mr_projected_blocks_expansion():
    cfg = SentinelConfig()
    policy = PolicyOutput(RegimeProb={"Trend": 0.7}, RiskMultiplier=1.0, ActionSuggested="HEDGE_ON", Reason="", Diagnostics={"SizingHint": "ADD_0.5_LONG"})
    gates = {"can_expand": True, "add_half_hint": "ADD_0.5_LONG"}
    portfolio_ctx = {}
    
    def high_mr_projected(action, sizing_hint=None, target_size=None):
        return 0.3 # > 0.25
        
    final_policy = sop_golden_rule_enforcer(policy, portfolio_ctx, gates, high_mr_projected, cfg)
    assert final_policy.ActionSuggested == "HOLD"
    assert final_policy.RiskMultiplier <= 0.3
    assert final_policy.Diagnostics.get("SizingHint") == "EXPANSION_BLOCKED_BY_MR"

def test_unlock_requires_green_hedge_long_structure():
    cfg = SentinelConfig()
    policy = PolicyOutput(RegimeProb={"Trend": 0.7}, RiskMultiplier=1.0, ActionSuggested="UNLOCK", Reason="")
    gates = {"short_green": False}
    portfolio_ctx = {"structure_ratio": "2:1_LONG"}
    
    final_policy = sop_golden_rule_enforcer(policy, portfolio_ctx, gates, mock_mr_projected, cfg)
    assert final_policy.ActionSuggested == "HOLD"
    assert final_policy.Diagnostics.get("blocked_by") == "unlock_requires_green_hedge"

def test_unlock_requires_green_hedge_short_structure():
    cfg = SentinelConfig()
    policy = PolicyOutput(RegimeProb={"Trend": 0.7}, RiskMultiplier=1.0, ActionSuggested="UNLOCK", Reason="")
    gates = {"long_green": False}
    portfolio_ctx = {"structure_ratio": "2:1_SHORT"}
    
    final_policy = sop_golden_rule_enforcer(policy, portfolio_ctx, gates, mock_mr_projected, cfg)
    assert final_policy.ActionSuggested == "HOLD"
    assert final_policy.Diagnostics.get("blocked_by") == "unlock_requires_green_hedge"

def test_chop_blocks_expansion():
    cfg = SentinelConfig()
    policy = PolicyOutput(RegimeProb={"Trend": 0.7}, RiskMultiplier=1.0, ActionSuggested="HEDGE_ON", Reason="")
    gates = {"can_expand": True}
    portfolio_ctx = {"TrendStatus": "CHOP"}
    
    final_policy = sop_golden_rule_enforcer(policy, portfolio_ctx, gates, mock_mr_projected, cfg)
    assert final_policy.ActionSuggested == "HOLD"
    assert final_policy.Diagnostics.get("blocked_by") == "chop_dead_market_filter"

def test_recovery_suspended_blocks_expansion():
    cfg = SentinelConfig()
    policy = PolicyOutput(RegimeProb={"Trend": 0.7}, RiskMultiplier=1.0, ActionSuggested="UNLOCK", Reason="")
    gates = {"can_expand": True, "short_green": True}
    portfolio_ctx = {"ContextMode": "RECOVERY_SUSPENDED", "structure_ratio": "2:1_LONG"}
    
    final_policy = sop_golden_rule_enforcer(policy, portfolio_ctx, gates, mock_mr_projected, cfg)
    assert final_policy.ActionSuggested == "HOLD"
    assert final_policy.Diagnostics.get("blocked_by") == "chop_dead_market_filter"
