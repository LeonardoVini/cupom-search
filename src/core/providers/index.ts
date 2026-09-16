import type { Coupon, CouponProvider, Store } from '../types.ts';
import { seedProvider } from './seed.ts';
import { communityProvider } from './community.ts';
import { affiliateProvider } from './affiliate.ts';

export const PROVIDERS: CouponProvider[] = [affiliateProvider, communityProvider, seedProvider];

export function trustOf(sourceId: string): number {
  return PROVIDERS.find((provider) => provider.id === sourceId)?.trust ?? 0.4;
}

/**
 * Consulta todos os providers em paralelo e deduplica por (loja, código),
 * mantendo a versão da fonte mais confiável e mais recente.
 */
export async function collectCoupons(store: Store, providers: CouponProvider[] = PROVIDERS): Promise<Coupon[]> {
  const results = await Promise.allSettled(providers.map((provider) => provider.fetch(store)));
  const best = new Map<string, Coupon>();

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const coupon of result.value) {
      if (!coupon.code) continue;
      const key = `${coupon.storeId}:${coupon.code.toUpperCase()}`;
      const current = best.get(key);
      if (!current) {
        best.set(key, coupon);
        continue;
      }
      const currentScore = trustOf(current.source) + freshnessBonus(current.lastSeenAt);
      const candidateScore = trustOf(coupon.source) + freshnessBonus(coupon.lastSeenAt);
      if (candidateScore > currentScore) best.set(key, coupon);
    }
  }
  return [...best.values()];
}

function freshnessBonus(lastSeenAt: string): number {
  const ageDays = (Date.now() - new Date(lastSeenAt).getTime()) / 86_400_000;
  return Number.isFinite(ageDays) ? Math.max(0, 0.3 - ageDays / 100) : 0;
}
