export type Ohlcv = [number, number, number, number, number, number]; // ts,o,h,l,c,v

export type PerSide = { 
  qty: number; 
  entry: number; 
  pnl: number; 
  bep?: number | null; 
  liq?: number | null; 
  marginUsed?: number | null; 
};

export type PerSymbolPos = {  
  long: PerSide; 
  short: PerSide;  
  netQtyUSDT: number | null; 
  netDirection: 'NET_LONG' | 'NET_SHORT' | 'LOCKED'; 
  netBEP: number | null;
};

export type ExcelRow = {
  Ts: string; Symbol: string; Timeframe: string;
  Bias4H: string; BiasStrength4H: string; Bias1H: string; BiasStrength1H: string;
  ATR4H: number | ''; ATR1H: number | ''; VolatilityRegime: string;
  Pivot: number | ''; StopHedge: number | '';
  SupplyLow: number | ''; SupplyHigh: number | '';
  DemandLow: number | ''; DemandHigh: number | '';
  KeyLevel1: number | ''; KeyLevel2: number | ''; ZoneQuality: string;
  LongQty: number | ''; LongEntry: number | ''; LongPnL: number | '';
  LongBEP: number | ''; LongLiqPrice: number | ''; LongMarginUsed: number | '';
  ShortQty: number | ''; ShortEntry: number | ''; ShortPnL: number | '';
  ShortBEP: number | ''; ShortLiqPrice: number | ''; ShortMarginUsed: number | '';
  NetQtyUSDT: number | ''; NetDirection: string; NetBEP: number | ''; RatioHint: string;
  'AccountMR%': number | ''; 'MR%': string | ''; MRProjected: number | '';
  MRDeltaIfAction: number | ''; PairRiskWeight: number | ''; RiskTag: string;
  Action: string; StrategyMode: string; RecoveryPhase: string; ActionRiskType: string;
  ActionSuggested: string; Status: string; Notes: string; BEP_2to1: number | '';
  ArchiveKey: string; SourceEmailId: string; FileName: string;
};
