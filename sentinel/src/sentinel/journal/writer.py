from typing import Dict, Any
from ..types import JournalRecord
from ..utils.fallback import FallbackStorage

def journal_write(
    ts: float,
    symbol: str,
    action_original: str,
    action_suggested: str,
    margin_ratio: float,
    regime_probs: Dict[str, float],
    reason: str,
    microstructure_flags: Dict[str, Any],
    tca_ref_id: str
):
    """
    Writes a journal record using the frozen contract.
    """
    record = JournalRecord(
        ts=ts,
        symbol=symbol,
        action_original=action_original,
        action_suggested=action_suggested,
        margin_ratio=margin_ratio,
        regime_probs=regime_probs,
        reason=reason,
        microstructure_flags=microstructure_flags,
        tca_ref_id=tca_ref_id
    )
    
    # Safely attempt to write to fallback storage without breaking at runtime
    try:
        fs = FallbackStorage()
        if hasattr(fs, 'add'):
            fs.add(record)
        elif hasattr(FallbackStorage, 'set'):
            key = f"journal_{ts}_{symbol}"
            FallbackStorage.set(key, record)
    except Exception as e:
        print(f"Fallback storage write failed: {e}")
        
    print(f"JOURNAL: {record}")
