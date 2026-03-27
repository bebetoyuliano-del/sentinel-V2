import numpy as np
from ..types import MarketSnapshot
from ..utils.math_utils import is_nan

def safe_z(val: float, mean: float, std: float, cap: float = 3.0) -> float:
    if is_nan(val) or is_nan(mean) or is_nan(std) or std == 0:
        return 0.0
    z = (val - mean) / std
    return max(-cap, min(cap, z))

def feature_engineering(snapshot: MarketSnapshot) -> np.ndarray:
    """
    Extracts exactly 6 features for the HMM.
    """
    atr_z = safe_z(snapshot.atr14, snapshot.atr14_mean, snapshot.atr14_std)
    spread_z = safe_z(snapshot.spread, snapshot.spread_mean, snapshot.spread_std)
    
    depth_ratio = 0.0
    if not is_nan(snapshot.depth_top) and not is_nan(snapshot.depth_mean) and snapshot.depth_mean != 0:
        depth_ratio = snapshot.depth_top / snapshot.depth_mean
        depth_ratio = max(0.0, min(5.0, depth_ratio)) # Cap ratio
        
    vwap_dist = 0.0
    if not is_nan(snapshot.price) and not is_nan(snapshot.vwap) and snapshot.vwap != 0:
        vwap_dist = (snapshot.price - snapshot.vwap) / snapshot.vwap
        vwap_dist = max(-0.1, min(0.1, vwap_dist))
        
    funding_z = safe_z(snapshot.funding_rate, snapshot.funding_mean, snapshot.funding_std)
    
    basis_pct = snapshot.basis_pct if not is_nan(snapshot.basis_pct) else 0.0
    basis_pct = max(-0.1, min(0.1, basis_pct))
    
    return np.array([atr_z, spread_z, depth_ratio, vwap_dist, funding_z, basis_pct])
