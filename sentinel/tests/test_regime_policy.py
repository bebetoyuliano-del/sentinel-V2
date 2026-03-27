import numpy as np
import pytest
from src.sentinel.config import SentinelConfig, HMMConfig
from src.sentinel.policy.regime_policy import map_regime_to_policy

def test_map_regime_to_policy_normal():
    cfg = SentinelConfig(hmm=HMMConfig())
    gamma_t = np.array([0.7, 0.1, 0.1, 0.1]) # Normal dominant
    policy = map_regime_to_policy(gamma_t, cfg, {})
    assert policy.ActionSuggested == "HOLD"
    assert policy.RiskMultiplier == 0.5

def test_map_regime_to_policy_trend():
    cfg = SentinelConfig(hmm=HMMConfig(threshold_trend=0.6))
    gamma_t = np.array([0.1, 0.7, 0.1, 0.1]) # Trend dominant
    policy = map_regime_to_policy(gamma_t, cfg, {})
    assert policy.ActionSuggested == "HEDGE_ON"
    assert policy.RiskMultiplier == 1.0
    # SizingHint is no longer asserted from RegimePolicy

def test_map_regime_to_policy_meanrevert_long():
    cfg = SentinelConfig(hmm=HMMConfig(threshold_meanrevert=0.5))
    gamma_t = np.array([0.1, 0.1, 0.7, 0.1]) # MeanRevert dominant
    policy = map_regime_to_policy(gamma_t, cfg, {"net_position_side": "LONG"})
    assert policy.ActionSuggested == "REDUCE_LONG"
    assert policy.RiskMultiplier == 0.5

def test_map_regime_to_policy_meanrevert_short():
    cfg = SentinelConfig(hmm=HMMConfig(threshold_meanrevert=0.5))
    gamma_t = np.array([0.1, 0.1, 0.7, 0.1]) # MeanRevert dominant
    policy = map_regime_to_policy(gamma_t, cfg, {"net_position_side": "SHORT"})
    assert policy.ActionSuggested == "REDUCE_SHORT"
    assert policy.RiskMultiplier == 0.5

def test_map_regime_to_policy_stress():
    cfg = SentinelConfig(hmm=HMMConfig(threshold_stress=0.35))
    gamma_t = np.array([0.1, 0.1, 0.1, 0.7]) # Stress dominant
    policy = map_regime_to_policy(gamma_t, cfg, {})
    assert policy.ActionSuggested == "LOCK_NEUTRAL"
    assert policy.RiskMultiplier == 0.2
