from ..types import TCARecord

def tca_benchmark_on_send(order_id: str, symbol: str, order_side: str, arrival_price: float, vwap: float) -> TCARecord:
    return TCARecord(
        order_id=order_id,
        order_side=order_side,
        arrival_price=arrival_price,
        vwap=vwap
    )

def tca_finalize_on_fill(record: TCARecord, fill_price: float) -> TCARecord:
    record.fill_price = fill_price
    if record.order_side == "BUY":
        record.slippage_bps = ((fill_price - record.arrival_price) / record.arrival_price) * 10000
    else:
        record.slippage_bps = ((record.arrival_price - fill_price) / record.arrival_price) * 10000
    return record
