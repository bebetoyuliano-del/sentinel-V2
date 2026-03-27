from typing import Tuple, Dict, Any
from ..types import MarketSnapshot
from ..config import SentinelConfig

def microstructure_guard(snapshot: MarketSnapshot, cfg: SentinelConfig) -> Tuple[float, Dict[str, Any]]:
    """
    Returns a throttle multiplier [0.0, 1.0] based on microstructure health.
    """
    throttle = 1.0
    flags = {}
    
    if snapshot.spread_std > 0:
        spread_z = (snapshot.spread - snapshot.spread_mean) / snapshot.spread_std
        if spread_z > cfg.micro.spread_z_trigger:
            throttle *= cfg.micro.throttle_penalty
            flags["high_spread"] = True
            
    depth_ratio = 0.0
    if snapshot.depth_mean > 0:
        depth_ratio = snapshot.depth_top / snapshot.depth_mean
        if depth_ratio < cfg.micro.depth_ratio_trigger:
            throttle *= cfg.micro.throttle_penalty
            flags["low_depth"] = True
            
    return throttle, flags
