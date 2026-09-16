/**
 * Cache em memória com TTL. Existe por dois motivos: a busca fica instantânea
 * na segunda vez e a gente não bate na loja (nem na API de afiliado) a cada
 * clique — o caminho mais rápido para ser bloqueado é parecer um robô insistente.
 */
export class TtlCache<T> {
  #ttlMs: number;
  #max: number;
  #entries = new Map<string, { value: T; expiresAt: number }>();

  constructor(ttlMs: number, max = 500) {
    this.#ttlMs = ttlMs;
    this.#max = max;
  }

  get(key: string): T | null {
    const entry = this.#entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.#entries.delete(key);
      return null;
    }
    // Reinsere para manter a ordem de uso (descarte LRU aproximado).
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.#entries.size >= this.#max) {
      const oldest = this.#entries.keys().next().value;
      if (oldest !== undefined) this.#entries.delete(oldest);
    }
    this.#entries.set(key, { value, expiresAt: Date.now() + this.#ttlMs });
  }

  /** Busca no cache ou executa o produtor e guarda o resultado. */
  async wrap(key: string, produce: () => Promise<T>): Promise<{ value: T; cached: boolean }> {
    const hit = this.get(key);
    if (hit !== null) return { value: hit, cached: true };
    const value = await produce();
    this.set(key, value);
    return { value, cached: false };
  }

  clear(): void {
    this.#entries.clear();
  }

  get size(): number {
    return this.#entries.size;
  }
}

const MINUTE = 60_000;

/** Página do produto muda pouco dentro de meia hora. */
export const productCache = new TtlCache<string>(30 * MINUTE, 300);
/** Cupons por loja: janela curta, porque cupom expira sem avisar. */
export const couponCache = new TtlCache<unknown>(10 * MINUTE, 200);
