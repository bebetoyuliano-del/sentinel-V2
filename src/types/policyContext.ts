export interface PolicyContext {
  symbol: string;
  accountMrDecimal: number | null;
  mrProjected: number | null;
  trendStatus: string;
  contextMode: string;
  longPos: any;
  shortPos: any;
  netDirection: string;
  netBEP: number | null;
  atr4h: number | null;
  volatilityRegime: string;
}
