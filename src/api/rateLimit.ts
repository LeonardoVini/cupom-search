const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;

const hits = new Map<string, { count: number; resetAt: number }>();

/** Janela fixa por IP — protege contra abuso e contra bater na loja em loop. */
export function rateLimit(key: string, max = MAX_REQUESTS): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, retryAfter: 0 };
  }
  entry.count += 1;
  if (entry.count > max) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
}, WINDOW_MS).unref();
