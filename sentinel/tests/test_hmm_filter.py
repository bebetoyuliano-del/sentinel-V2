import numpy as np
import pytest
from src.sentinel.hmm.filter import init_hmm_state, initialize_hmm_params, hmm_forward_filter
from src.sentinel.hmm.models import HMMState, HMMParams

def test_init_hmm_state():
    n_states = 4
    state = init_hmm_state(n_states)
    assert isinstance(state, HMMState)
    assert len(state.gamma_t) == n_states
    assert np.allclose(state.gamma_t, np.ones(n_states) / n_states)

def test_initialize_hmm_params():
    params = initialize_hmm_params()
    assert isinstance(params, HMMParams)
    assert params.pi.shape == (4,)
    assert params.A.shape == (4, 4)
    assert params.mu.shape == (4, 6)
    assert params.Sigma.shape == (4, 6)

def test_hmm_forward_filter_basic():
    n_states = 4
    features = np.array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6])
    
    initial_state = init_hmm_state(n_states)
    params = initialize_hmm_params()
    
    new_state = hmm_forward_filter(features, initial_state, params)
    assert isinstance(new_state, HMMState)
    assert len(new_state.gamma_t) == n_states
    assert np.isclose(np.sum(new_state.gamma_t), 1.0)
