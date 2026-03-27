from dataclasses import dataclass, field
from typing import Dict, Any, Optional

@dataclass
class MarketSnapshot:
    symbol: str
    ts: float
    price: float
    vwap: float
    atr14: float
    atr14_mean: float
    atr14_std: float
    spread: float
    spread_mean: float
    spread_std: float
    depth_top: float
    depth_mean: float
    funding_rate: float
    funding_mean: float
    funding_std: float
    basis_pct: float
    best_bid: Optional[float] = None
    best_ask: Optional[float] = None

@dataclass
class PolicyOutput:
    RegimeProb: Dict[str, float]
    RiskMultiplier: float
    ActionSuggested: str
    Reason: str
    Diagnostics: Dict[str, Any] = field(default_factory=dict)

@dataclass
class JournalRecord:
    ts: float
    symbol: str
    action_original: str
    action_suggested: str
    margin_ratio: float
    regime_probs: Dict[str, float]
    reason: str
    microstructure_flags: Dict[str, Any]
    tca_ref_id: str

@dataclass
class TCARecord:
    order_id: str
    order_side: str
    arrival_price: float
    vwap: float
    fill_price: Optional[float] = None
    slippage_bps: Optional[float] = None
    microstructure_flags: Dict[str, Any] = field(default_factory=dict)
