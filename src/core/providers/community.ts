import type { Coupon, CouponProvider, Store } from '../types.ts';
import { db } from '../../db/store.ts';

/** Cupons enviados por usuários. Confiança vem do feedback, não da fonte. */
export const communityProvider: CouponProvider = {
  id: 'community',
  trust: 0.5,
  async fetch(store: Store): Promise<Coupon[]> {
    try {
      return await db.couponsByStore(store.id);
    } catch {
      return [];
    }
  },
};
