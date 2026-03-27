import numpy as np
import pytest
from src.sentinel.types import MarketSnapshot
from src.sentinel.features.engineering import feature_engineering, safe_z

def create_market_snapshot(
    symbol="BTC-USD", ts=1678886400.0, price=25000.0, vwap=25050.0,
    atr14=500.0, atr14_mean=450.0, atr14_std=50.0,
    spread=10.0, spread_mean=8.0, spread_std=2.0,
    depth_top=1000.0, depth_mean=5000.0,
    funding_rate=0.0001, funding_mean=0.00005, funding_std=0.00002,
    basis_pct=0.001
) -> MarketSnapshot:
    return MarketSnapshot(
        symbol=symbol, ts=ts, price=price, vwap=vwap,
        atr14=atr14, atr14_mean=atr14_mean, atr14_std=atr14_std,
        spread=spread, spread_mean=spread_mean, spread_std=spread_std,
        depth_top=depth_top, depth_mean=depth_mean,
        funding_rate=funding_rate, funding_mean=funding_mean, funding_std=funding_std,
        basis_pct=basis_pct
    )

def test_feature_engineering_output_shape():
    snapshot = create_market_snapshot()
    features = feature_engineering(snapshot)
    assert isinstance(features, np.ndarray)
    assert len(features) == 6, "Feature engineering should return exactly 6 features"

def test_feature_engineering_values():
    snapshot = create_market_snapshot()
    features = feature_engineering(snapshot)
    
    assert np.isclose(features[0], 1.0) 
    assert np.isclose(features[1], 1.0)
    assert np.isclose(features[2], 0.2)
    assert np.isclose(features[3], -0.001996007984031936)
    assert np.isclose(features[4], 2.5)
    assert np.isclose(features[5], 0.001)

def test_feature_engineering_nan_inputs():
    snapshot = create_market_snapshot(
        atr14=np.nan, atr14_mean=np.nan, atr14_std=np.nan,
        spread=np.nan, spread_mean=np.nan, spread_std=np.nan,
        depth_top=np.nan, depth_mean=np.nan,
        funding_rate=np.nan, funding_mean=np.nan, funding_std=np.nan,
        basis_pct=np.nan
    )
    features = feature_engineering(snapshot)
    assert all(f == 0.0 for f in features)
