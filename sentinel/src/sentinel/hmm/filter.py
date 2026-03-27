import numpy as np
import time
from .models import HMMParams, HMMState
from ..utils.math_utils import diag_gaussian_pdf, safe_normalize

def init_hmm_state(n_states: int) -> HMMState:
    return HMMState(
        gamma_t=np.ones(n_states) / n_states,
        logL=0.0,
        buffer=[]
    )

def initialize_hmm_params() -> HMMParams:
    # TODO: Load from trained model persistence
    # Stubbing with safe defaults for 4 states, 6 features
    return HMMParams(
        pi=np.array([0.25, 0.25, 0.25, 0.25]),
        A=np.array([
            [0.7, 0.1, 0.1, 0.1],
            [0.1, 0.7, 0.1, 0.1],
            [0.1, 0.1, 0.7, 0.1],
            [0.1, 0.1, 0.1, 0.7]
        ]),
        mu=np.zeros((4, 6)),
        Sigma=np.ones((4, 6)),
        last_fit_ts=time.time()
    )

def hmm_forward_filter(features: np.ndarray, state: HMMState, params: HMMParams, max_buffer_window: int = 100) -> HMMState:
    """Standard HMM forward pass step."""
    n_states = len(state.gamma_t)
    new_probs = np.zeros(n_states)
    
    for i in range(n_states):
        # Emission probability
        emission_prob = diag_gaussian_pdf(features, params.mu[i], params.Sigma[i])
        
        # Transition probability
        transition_sum = sum(state.gamma_t[j] * params.A[j][i] for j in range(n_states))
        
        new_probs[i] = emission_prob * transition_sum
        
    c_t = np.sum(new_probs)
    if c_t > 0:
        state.logL += np.log(c_t)
        
    state.gamma_t = safe_normalize(new_probs)
    
    state.buffer.append(state.gamma_t.copy())
    if len(state.buffer) > max_buffer_window:
        state.buffer.pop(0)
        
    return state
