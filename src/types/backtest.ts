export interface BacktestSettings {
  takeProfitPct: number;
  lock11Mode: boolean;
  lockTriggerPct: number;
  add05Mode: boolean;
  structure21Mode: boolean;
  maxMrPct: number;
}

export interface BacktestSummary {
  initialBalance: number;
  finalBalance: number;
  totalProfit: number;
  profitPct: number;
  totalTrades: number;
  winRate: number;
  maxDrawdown: number;
}

export interface BacktestTrade {
  type: string;
  entryPrice: number;
  entryTime: number;
  exitPrice: number;
  exitTime: number;
  exitReason: string;
  isHedged: boolean;
  hedgeCount: number;
  profit: number;
  profitPct: number;
  finalBalance: number;
}

export interface BacktestResult {
  symbol: string;
  timeframe: string;
  days: number;
  settings?: BacktestSettings;
  summary: BacktestSummary;
  trades: BacktestTrade[];
  equityCurve: any[];
}
