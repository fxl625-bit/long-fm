type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export class InMemoryTTLCache {
  private readonly storage = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | null {
    const hit = this.storage.get(key);
    if (!hit) {
      return null;
    }

    if (Date.now() > hit.expiresAt) {
      this.storage.delete(key);
      return null;
    }

    return hit.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.storage.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  clear(): void {
    this.storage.clear();
  }
}

