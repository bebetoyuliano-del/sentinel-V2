export class MarketCache {
  private cache: Map<string, { data: any, timestamp: number }> = new Map();
  private ttl: number;

  constructor(ttlMinutes: number = 14) {
    this.ttl = ttlMinutes * 60 * 1000;
  }

  set(key: string, data: any) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  get(key: string): any | null {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    return item.data;
  }

  clear() {
    this.cache.clear();
  }
}

export const marketCache = new MarketCache(14); // 14 minutes TTL
