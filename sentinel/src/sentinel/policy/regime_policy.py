import numpy as np
from typing import Dict, Any
from ..types import PolicyOutput
from ..config import SentinelConfig

def map_regime_to_policy(gamma_t: np.ndarray, cfg: SentinelConfig, portfolio_ctx: Dict[str, Any]) -> PolicyOutput:
    """Maps HMM state probabilities to a trading policy."""
    regime_names = ["Normal", "Trend", "MeanRevert", "Stress"]
    regime_probs = {name: float(prob) for name, prob in zip(regime_names, gamma_t)}
    
    dominant_idx = int(np.argmax(gamma_t))
    dominant_regime = regime_names[dominant_idx]
    
    action = "HOLD"
    rm = 0.5
    reason = f"Dominant regime: {dominant_regime}"
    diagnostics = {}
    
    net_side = portfolio_ctx.get("net_position_side", "FLAT")
    
    if dominant_regime == "Stress" and regime_probs["Stress"] >= cfg.hmm.threshold_stress:
        action = "LOCK_NEUTRAL"
        rm = 0.2
    elif dominant_regime == "Trend" and regime_probs["Trend"] >= cfg.hmm.threshold_trend:
        action = "HEDGE_ON"
        rm = 1.0
    elif dominant_regime == "MeanRevert" and regime_probs["MeanRevert"] >= cfg.hmm.threshold_meanrevert:
        if net_side == "LONG":
            action = "REDUCE_LONG"
        elif net_side == "SHORT":
            action = "REDUCE_SHORT"
        else:
            action = "HOLD"
        rm = 0.5
    else:
        action = "HOLD"
        rm = 0.5
        
    return PolicyOutput(
        RegimeProb=regime_probs,
        RiskMultiplier=rm,
        ActionSuggested=action,
        Reason=reason,
        Diagnostics=diagnostics
    )
