import test from 'node:test';
import assert from 'node:assert/strict';
import { collectCoupons } from '../src/core/providers/index.ts';
import { seedProvider } from '../src/core/providers/seed.ts';
import { affiliateProvider } from '../src/core/providers/affiliate.ts';
import { findStoreById } from '../src/core/stores.ts';
import type { Coupon, CouponProvider, Store } from '../src/core/types.ts';

const pichau = findStoreById('pichau') as Store;

function fakeProvider(id: string, trust: number, coupons: Partial<Coupon>[]): CouponProvider {
  return {
    id,
    trust,
    async fetch() {
      return coupons.map((coupon) => ({
        id: `${id}-${coupon.code}`,
        storeId: 'pichau',
        code: 'X',
        description: '',
        type: 'percent' as const,
        value: 10,
        rules: {},
        expiresAt: null,
        lastSeenAt: new Date().toISOString(),
        source: id,
        ...coupon,
      }));
    },
  };
}

test('seedProvider só devolve cupons da loja pedida e marca como demo', async () => {
  const coupons = await seedProvider.fetch(pichau);
  assert.ok(coupons.length > 0);
  assert.ok(coupons.every((coupon) => coupon.storeId === 'pichau'));
  assert.ok(coupons.every((coupon) => coupon.demo === true));
  assert.ok(coupons.every((coupon) => coupon.expiresAt === null || new Date(coupon.expiresAt) > new Date()));
});

test('collectCoupons deduplica por código mantendo a fonte mais confiável', async () => {
  const low = fakeProvider('seed-demo', 0.35, [{ code: 'IGUAL', description: 'da fonte fraca' }]);
  const high = fakeProvider('affiliate-awin', 0.9, [{ code: 'igual', description: 'da fonte forte' }]);
  const coupons = await collectCoupons(pichau, [low, high]);
  assert.equal(coupons.length, 1);
  assert.equal(coupons[0].description, 'da fonte forte');
});

test('collectCoupons ignora provider que explode e descarta cupom sem código', async () => {
  const broken: CouponProvider = {
    id: 'broken',
    trust: 0.9,
    async fetch() {
      throw new Error('api fora do ar');
    },
  };
  const ok = fakeProvider('community', 0.5, [{ code: 'VALE' }, { code: '' }]);
  const coupons = await collectCoupons(pichau, [broken, ok]);
  assert.deepEqual(coupons.map((coupon) => coupon.code), ['VALE']);
});

test('affiliateProvider devolve vazio sem credenciais configuradas', async () => {
  delete process.env.AWIN_API_TOKEN;
  assert.deepEqual(await affiliateProvider.fetch(pichau), []);
});
