export interface PolicyContextData {
  symbol: string;
  action: string;
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

export class PolicyContext {
  private data: PolicyContextData;

  constructor(data: PolicyContextData) {
    this.data = data;
  }

  get symbol() { return this.data.symbol; }
  get action() { return this.data.action; }
  get accountMrDecimal() { return this.data.accountMrDecimal; }
  get mrProjected() { return this.data.mrProjected; }
  get trendStatus() { return this.data.trendStatus; }
  get contextMode() { return this.data.contextMode; }
  get longPos() { return this.data.longPos; }
  get shortPos() { return this.data.shortPos; }
  get netDirection() { return this.data.netDirection; }
  get netBEP() { return this.data.netBEP; }
  get atr4h() { return this.data.atr4h; }
  get volatilityRegime() { return this.data.volatilityRegime; }

  isLocked11(): boolean {
    return this.data.longPos?.qty > 0 && this.data.longPos?.qty === this.data.shortPos?.qty;
  }

  isNetLong(): boolean {
    return (this.data.longPos?.qty || 0) > (this.data.shortPos?.qty || 0);
  }

  isNetShort(): boolean {
    return (this.data.shortPos?.qty || 0) > (this.data.longPos?.qty || 0);
  }

  hasLong(): boolean {
    return (this.data.longPos?.qty || 0) > 0;
  }

  hasShort(): boolean {
    return (this.data.shortPos?.qty || 0) > 0;
  }

  isLongGreen(): boolean {
    return this.hasLong() && (this.data.longPos?.pnl || 0) > 0;
  }

  isShortGreen(): boolean {
    return this.hasShort() && (this.data.shortPos?.pnl || 0) > 0;
  }
}
