import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Coupon, CouponProvider, Store } from '../types.ts';

const SEED_PATH = fileURLToPath(new URL('../../../data/coupons.seed.json', import.meta.url));
const DAY_MS = 86_400_000;

interface SeedCoupon extends Omit<Coupon, 'expiresAt' | 'lastSeenAt' | 'source'> {
  daysUntilExpiry: number | null;
  daysSinceSeen: number;
}

let cache: Coupon[] | null = null;

/**
 * Provider de demonstração: lê `data/coupons.seed.json`, cujas datas são
 * relativas a hoje para o app nunca abrir com tudo vencido. Todo cupom daqui
 * vem marcado como `demo: true` e a UI diz isso em voz alta.
 */
export const seedProvider: CouponProvider = {
  id: 'seed-demo',
  trust: 0.35,
  async fetch(store: Store): Promise<Coupon[]> {
    if (!cache) {
      const now = Date.now();
      try {
        const raw = JSON.parse(await readFile(SEED_PATH, 'utf8')) as { coupons: SeedCoupon[] };
        cache = raw.coupons.map(({ daysUntilExpiry, daysSinceSeen, ...coupon }) => ({
          ...coupon,
          expiresAt: daysUntilExpiry === null ? null : new Date(now + daysUntilExpiry * DAY_MS).toISOString(),
          lastSeenAt: new Date(now - daysSinceSeen * DAY_MS).toISOString(),
          source: 'seed-demo',
          demo: true,
        }));
      } catch {
        cache = [];
      }
    }
    return cache.filter((coupon) => coupon.storeId === store.id);
  },
};
