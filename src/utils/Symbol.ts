export function normalizeSymbolInput(rawSymbol?: string): string {
    if (!rawSymbol) return "";
    let s = rawSymbol.toUpperCase().trim();
    // Remove any existing /USDT or USDT suffix to get the base
    s = s.replace(/\/USDT$/, '').replace(/USDT$/, '').replace(/:USDT$/, '');
    return `${s}/USDT`;
}
