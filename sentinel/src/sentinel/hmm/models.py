from dataclasses import dataclass, field
from typing import List
import numpy as np

@dataclass
class HMMParams:
    pi: np.ndarray
    A: np.ndarray
    mu: np.ndarray
    Sigma: np.ndarray
    last_fit_ts: float

@dataclass
class HMMState:
    gamma_t: np.ndarray
    logL: float
    buffer: List[np.ndarray] = field(default_factory=list)
