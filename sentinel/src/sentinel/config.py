from dataclasses import dataclass

@dataclass
class HMMConfig:
    n_states: int = 4
    threshold_trend: float = 0.60
    threshold_meanrevert: float = 0.50
    threshold_stress: float = 0.35
    fallback_regime: str = "Normal"
    max_buffer_window: int = 100

@dataclass
class MicrostructureConfig:
    spread_z_trigger: float = 2.0
    depth_ratio_trigger: float = 0.2
    throttle_penalty: float = 0.5

@dataclass
class SOPConfig:
    max_mr_hard_guard: float = 0.25
    spot_move_lock_trigger_pct: float = 4.0

@dataclass
class HedgingConfig:
    mode: str = "1:1_lock"

@dataclass
class SentinelConfig:
    hmm: HMMConfig = HMMConfig()
    micro: MicrostructureConfig = MicrostructureConfig()
    sop: SOPConfig = SOPConfig()
    hedging: HedgingConfig = HedgingConfig()
    observability_enabled: bool = True
