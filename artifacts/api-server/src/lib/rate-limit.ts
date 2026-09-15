interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const entries = new Map<string, RateLimitEntry>();

export function consumeRateLimit(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();
  const current = entries.get(key);
  if (!current || current.resetAt <= now) {
    entries.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (current.count >= maxAttempts) return false;
  current.count += 1;
  return true;
}

export function pruneRateLimitEntries(): void {
  const now = Date.now();
  for (const [key, entry] of entries) {
    if (entry.resetAt <= now) entries.delete(key);
  }
}