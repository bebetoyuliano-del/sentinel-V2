import pytest
import numpy as np
from src.sentinel.pipeline.decision_cycle import sentinel_decision_cycle
from src.sentinel.types import MarketSnapshot
from src.sentinel.hmm.models import HMMState, HMMParams
from src.sentinel.config import SentinelConfig

def mock_mr_projected(action, sizing_hint=None, target_size=None):
    return 0.1

def test_decision_cycle_return_contract():
    snapshot = MarketSnapshot(
        symbol="BTC-USD", ts=1.0, price=100.0, vwap=100.0,
        atr14=1.0, atr14_mean=1.0, atr14_std=1.0,
        spread=0.1, spread_mean=0.1, spread_std=0.1,
        depth_top=10.0, depth_mean=10.0,
        funding_rate=0.0, funding_mean=0.0, funding_std=0.0,
        basis_pct=0.0
    )
    hmm_state = HMMState(gamma_t=np.array([0.25, 0.25, 0.25, 0.25]), logL=0.0)
    hmm_params = HMMParams(pi=np.ones(4)/4, A=np.ones((4,4))/4, mu=np.zeros((4,6)), Sigma=np.ones((4,6)), last_fit_ts=1.0)
    portfolio_ctx = {"margin_ratio": 0.1, "base_capital": 1000.0}
    cfg = SentinelConfig()
    decision_card = {"Action": "HOLD"}
    
    result = sentinel_decision_cycle(snapshot, hmm_state, hmm_params, portfolio_ctx, cfg, mock_mr_projected, decision_card)
    
    assert "ActionOriginal" in result
    assert "ActionSuggested" in result
    assert "RiskMultiplier" in result
    assert "TargetSize" in result
    assert "RegimeProb" in result
    assert "Reason" in result
    assert "Diagnostics" in result
    assert result["ActionOriginal"] == "HOLD"

def test_decision_cycle_mr_hard_guard():
    snapshot = MarketSnapshot(
        symbol="BTC-USD", ts=1.0, price=100.0, vwap=100.0,
        atr14=1.0, atr14_mean=1.0, atr14_std=1.0,
        spread=0.1, spread_mean=0.1, spread_std=0.1,
        depth_top=10.0, depth_mean=10.0,
        funding_rate=0.0, funding_mean=0.0, funding_std=0.0,
        basis_pct=0.0
    )
    hmm_state = HMMState(gamma_t=np.array([0.25, 0.25, 0.25, 0.25]), logL=0.0)
    hmm_params = HMMParams(pi=np.ones(4)/4, A=np.ones((4,4))/4, mu=np.zeros((4,6)), Sigma=np.ones((4,6)), last_fit_ts=1.0)
    portfolio_ctx = {"margin_ratio": 0.3, "base_capital": 1000.0} # > 0.25
    cfg = SentinelConfig()
    decision_card = {"Action": "HOLD"}
    
    result = sentinel_decision_cycle(snapshot, hmm_state, hmm_params, portfolio_ctx, cfg, mock_mr_projected, decision_card)
    
    assert result["ActionSuggested"] == "LOCK_NEUTRAL"
    assert result["RiskMultiplier"] == 0.0
