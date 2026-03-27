import { PerSide, PerSymbolPos, ExcelRow } from '../types/decisionCard';
import { deriveVolatilityRegime } from './Math';
import { deriveActionRiskType, deriveRiskTag } from './ActionParsers';

export function mapPositionsForSymbol(allPositions: any[], symbol: string, lastPrice?: number): PerSymbolPos {
  const same = (p: any) => p.symbol === symbol;
  const longPos  = allPositions.find((p: any) => same(p) && (p.side === 'long' || (p.side === 'both' && parseFloat(p.info.positionAmt) > 0)));
  const shortPos = allPositions.find((p: any) => same(p) && (p.side === 'short' || (p.side === 'both' && parseFloat(p.info.positionAmt) < 0)));
  const long: PerSide = {
    qty: longPos ? Math.abs(longPos.contracts) : 0,
    entry: longPos?.entryPrice ?? 0,
    pnl: longPos?.unrealizedPnl ?? 0,
    bep: longPos?.entryPrice ?? null,
    liq: longPos?.liquidationPrice ?? longPos?.info?.liquidationPrice ?? null,
    marginUsed: longPos?.initialMargin ?? longPos?.info?.initialMargin ?? null
  };
  const short: PerSide = {
    qty: shortPos ? Math.abs(shortPos.contracts) : 0,
    entry: shortPos?.entryPrice ?? 0,
    pnl: shortPos?.unrealizedPnl ?? 0,
    bep: shortPos?.entryPrice ?? null,
    liq: shortPos?.liquidationPrice ?? shortPos?.info?.liquidationPrice ?? null,
    marginUsed: shortPos?.initialMargin ?? shortPos?.info?.initialMargin ?? null
  };
  let netQtyUSDT: number | null = null;
  if (lastPrice && (long.qty > 0 || short.qty > 0)) {
    netQtyUSDT = Math.abs(long.qty - short.qty) * lastPrice;
  }
  const netDirection = long.qty === short.qty ? 'LOCKED' : (long.qty > short.qty ? 'NET_LONG' : 'NET_SHORT');
  let netBEP: number | null = null;
  if (long.qty === short.qty && long.qty > 0) {
    netBEP = (long.entry + short.entry) / 2;
  } else if (long.qty !== short.qty && long.entry && short.entry) {
    const longNotional  = long.entry  * long.qty;
    const shortNotional = short.entry * short.qty;
    const diffContracts = (long.qty - short.qty);
    if (diffContracts !== 0) netBEP = (longNotional - shortNotional) / diffContracts;
  }
  return { long, short, netQtyUSDT, netDirection, netBEP };
}

export function deriveBiasStrength4H(trend4h: string | null | undefined, waeExploding?: boolean | null) {
  if (!trend4h || trend4h.toUpperCase() === 'NEUTRAL' || trend4h.toUpperCase() === 'NETRAL') return 'RANGE';
  const strong = !!waeExploding;
  if (trend4h.toUpperCase() === 'UP')   return strong ? 'STRONG_UP' : 'WEAK_UP';
  if (trend4h.toUpperCase() === 'DOWN') return strong ? 'STRONG_DOWN' : 'WEAK_DOWN';
  return 'RANGE';
}

export function deriveBiasStrength1H(structure1h: string | null | undefined) {
  const s = (structure1h || '').toUpperCase();
  if (!s) return 'RANGE';
  if (s.includes('BOS') || s.includes('CHOCH')) {
    return s.includes('_BULL') ? 'STRONG_UP' : 'STRONG_DOWN';
  }
  return 'RANGE';
}

export function composeExcelRows(params: {
  cards: any[]; positions: any[]; marketData: any; accountRisk: any;
}): ExcelRow[] {
  const rows: ExcelRow[] = [];
  const accMrPct = params?.accountRisk?.marginRatio ?? null; // % 0..100
  const accMrDecimal = accMrPct != null ? accMrPct / 100 : null;
  const wallet = params?.accountRisk?.walletBalance ?? null;
  for (const c of (params.cards || [])) {
    const symbol = (c.symbol || '').split(':')[0]; // "BASE/USDT"
    const md = params.marketData[symbol] || params.marketData[`${symbol}:USDT`] || {};
    const md4 = md?.TF_4H || {};
    const md1 = md?.TF_1H || {};
    const priceNow = md?.currentPrice ?? null;
    const per = mapPositionsForSymbol(params.positions, symbol, priceNow);
    const bias4h = (c?.structure?.trend_4h || 'NETRAL').toString().toUpperCase().replace('NEUTRAL','NETRAL');
    const bias1h = (c?.structure?.smc_1h?.structure || 'UNKNOWN').toString().toUpperCase();
    const bs4h   = deriveBiasStrength4H(bias4h, md4?.WAE?.isExploding ?? null);
    const bs1h   = deriveBiasStrength1H(bias1h);
    const atr4h = md4?.ATR14 ?? null;
    const atr1h = md1?.ATR14 ?? null;
    const atrPct4h = (atr4h && priceNow) ? (atr4h / priceNow) * 100 : null;
    const volReg = deriveVolatilityRegime(atrPct4h);
    const pivot   = (c?.levels?.pivot ?? md4?.RQK_Channel?.estimate ?? null);
    const stopHdg = (c?.levels?.stop_hedge_lock ?? null);
    const supplyLo = c?.levels?.supply?.zone?.[0] ?? '';
    const supplyHi = c?.levels?.supply?.zone?.[1] ?? '';
    const demandLo = c?.levels?.demand?.zone?.[0] ?? '';
    const demandHi = c?.levels?.demand?.zone?.[1] ?? '';
    const ratioHint = c?.positions?.ratio_hint ?? 'OTHER';
    const netQtyUSDT = per.netQtyUSDT ?? '';
    const netDir = per.netDirection;
    const netBEP = per.netBEP ?? '';
    const mrProjectedPct = typeof c?.action_now?.mr_projected_if_action === 'number'
      ? c.action_now.mr_projected_if_action
      : '';
    const mrDelta = (typeof mrProjectedPct === 'number' && accMrPct != null)
      ? (mrProjectedPct/100 - accMrPct/100)
      : '';
    const pairWeight = (wallet && priceNow && (per.long.qty || per.short.qty))
      ? (((per.long.qty * priceNow) + (per.short.qty * priceNow)) / wallet)
      : '';
    const action = c?.action_now?.action || c?.action || 'HOLD';
    const actRisk = deriveActionRiskType(action, typeof mrDelta === 'number' ? mrDelta : null);
    const riskTag = deriveRiskTag(accMrDecimal, typeof mrDelta === 'number' ? mrDelta : null);
    const tsIso = new Date().toISOString();
    const archiveKey = `${tsIso}|${symbol}|4H`;
    rows.push({
      Ts: tsIso,
      Symbol: symbol,
      Timeframe: '4H',
      Bias4H: bias4h,
      BiasStrength4H: bs4h,
      Bias1H: bias1h,
      BiasStrength1H: bs1h,
      ATR4H: atr4h ?? '',
      ATR1H: atr1h ?? '',
      VolatilityRegime: volReg,
      Pivot: pivot ?? '',
      StopHedge: stopHdg ?? '',
      SupplyLow: supplyLo,
      SupplyHigh: supplyHi,
      DemandLow: demandLo,
      DemandHigh: demandHi,
      KeyLevel1: '', KeyLevel2: '', ZoneQuality: '',
      LongQty: per.long.qty || '',
      LongEntry: per.long.entry || '',
      LongPnL: per.long.pnl || '',
      LongBEP: per.long.bep ?? '',
      LongLiqPrice: per.long.liq ?? '',
      LongMarginUsed: per.long.marginUsed ?? '',
      ShortQty: per.short.qty || '',
      ShortEntry: per.short.entry || '',
      ShortPnL: per.short.pnl || '',
      ShortBEP: per.short.bep ?? '',
      ShortLiqPrice: per.short.liq ?? '',
      ShortMarginUsed: per.short.marginUsed ?? '',
      NetQtyUSDT: netQtyUSDT,
      NetDirection: netDir,
      NetBEP: netBEP,
      RatioHint: ratioHint,
      'AccountMR%': accMrDecimal ?? '',
      'MR%': (accMrPct != null) ? `${accMrPct.toFixed(2)}%` : '',
      MRProjected: typeof mrProjectedPct === 'number' ? mrProjectedPct : '',
      MRDeltaIfAction: typeof mrDelta === 'number' ? mrDelta : '',
      PairRiskWeight: pairWeight || '',
      RiskTag: riskTag,
      Action: action,
      StrategyMode: c?.strategy_mode || 'RECOVERY',
      RecoveryPhase: c?.recovery_phase || 'PHASE_1',
      ActionRiskType: actRisk,
      ActionSuggested: '',
      Status: '',
      Notes: '',
      BEP_2to1: c?.action_now?.bep_price_if_2_to_1 ?? '',
      ArchiveKey: archiveKey,
      SourceEmailId: '',
      FileName: ''
    });
  }
  return rows;
}
