import test from 'node:test';
import assert from 'node:assert/strict';
import {
  matchCoupon,
  rankMatches,
  estimateSavings,
  evidenceScore,
  freshnessScore,
  medianDiscount,
} from '../src/core/matching.ts';
import type { Coupon, Evidence, Product } from '../src/core/types.ts';
import { emptyEvidence } from '../src/core/types.ts';

const NOW = new Date('2026-09-16T12:00:00Z');
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString();

function coupon(overrides: Partial<Coupon> = {}): Coupon {
  return {
    id: 'c1',
    storeId: 'pichau',
    code: 'TESTE10',
    description: '10% off',
    type: 'percent',
    value: 10,
    rules: {},
    expiresAt: daysFromNow(10),
    lastSeenAt: daysFromNow(-1),
    source: 'community',
    ...overrides,
  };
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    url: 'https://www.pichau.com.br/mesa',
    storeId: 'pichau',
    storeName: 'Pichau',
    title: 'Mesa Gamer',
    price: 1000,
    currency: 'BRL',
    categories: ['moveis', 'mesa'],
    sku: null,
    source: 'json-ld',
    ...overrides,
  };
}

test('cupom percentual estima economia e preço final', () => {
  const match = matchCoupon(coupon(), product(), { now: NOW });
  assert.equal(match.applicable, true);
  assert.equal(match.estimatedSavings, 100);
  assert.equal(match.finalPrice, 900);
});

test('teto de desconto limita a economia', () => {
  assert.equal(estimateSavings(coupon({ rules: { maxDiscountValue: 50 } }), 1000), 50);
});

test('desconto nunca passa do preço do produto', () => {
  assert.equal(estimateSavings(coupon({ type: 'fixed', value: 500 }), 100), 100);
});

test('carrinho mínimo bloqueia e explica quanto falta', () => {
  const match = matchCoupon(coupon({ rules: { minCartValue: 1500 } }), product({ price: 1000 }), { now: NOW });
  assert.equal(match.applicable, false);
  assert.match(match.blockers.join(' '), /faltam R\$\s?500,00/);
  assert.equal(match.estimatedSavings, null);
});

test('categoria restrita bloqueia produto de fora', () => {
  const match = matchCoupon(
    coupon({ rules: { includeCategories: ['placa de video'] } }),
    product({ categories: ['moveis', 'mesa'] }),
    { now: NOW },
  );
  assert.equal(match.applicable, false);
  assert.match(match.blockers.join(' '), /Restrito a/);
});

test('categoria compatível é aceita mesmo com acento e plural aproximado', () => {
  const match = matchCoupon(
    coupon({ rules: { includeCategories: ['Móveis'] } }),
    product({ categories: ['moveis'] }),
    { now: NOW },
  );
  assert.equal(match.applicable, true);
});

test('cupom expirado zera a confiança', () => {
  const match = matchCoupon(coupon({ expiresAt: daysFromNow(-1) }), product(), { now: NOW });
  assert.equal(match.confidence, 0);
  assert.equal(match.applicable, false);
});

test('restrições brandas não bloqueiam, mas derrubam a confiança', () => {
  const base = matchCoupon(coupon(), product(), { now: NOW });
  const restricted = matchCoupon(coupon({ rules: { firstPurchaseOnly: true } }), product(), { now: NOW });
  assert.equal(restricted.applicable, true);
  assert.ok(restricted.confidence < base.confidence);
  assert.match(restricted.blockers.join(' '), /primeira compra/);
});

test('sem preço na página, o mínimo vira ressalva e não bloqueio', () => {
  const match = matchCoupon(coupon({ rules: { minCartValue: 300 } }), product({ price: null }), { now: NOW });
  const baseline = matchCoupon(coupon(), product(), { now: NOW });
  assert.equal(match.applicable, true);
  assert.match(match.blockers.join(' '), /não li o preço/);
  assert.ok(match.confidence < baseline.confidence);
});

test('categoria restrita sem categoria lida vira ressalva, não bloqueio', () => {
  const match = matchCoupon(
    coupon({ rules: { includeCategories: ['placa de video'] } }),
    product({ categories: [] }),
    { now: NOW },
  );
  assert.equal(match.applicable, true);
  assert.match(match.blockers.join(' '), /não consegui ler a categoria/);
});

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return { ...emptyEvidence('pichau:TESTE10'), ...overrides };
}

test('relato positivo aumenta a confiança; negativo derruba', () => {
  const neutral = matchCoupon(coupon(), product(), { now: NOW });
  const good = matchCoupon(coupon(), product(), {
    now: NOW,
    evidence: evidence({ reports: { worked: 20, failed: 0 }, lastSuccessAt: daysFromNow(-1) }),
  });
  const bad = matchCoupon(coupon(), product(), {
    now: NOW,
    evidence: evidence({ reports: { worked: 0, failed: 20 } }),
  });
  assert.ok(good.confidence > neutral.confidence);
  assert.ok(bad.confidence < neutral.confidence);
});

test('teste no checkout pesa mais que relato manual', () => {
  const reported = matchCoupon(coupon(), product(), {
    now: NOW,
    evidence: evidence({ reports: { worked: 5, failed: 0 }, lastAttemptAt: daysFromNow(-1) }),
  });
  const validated = matchCoupon(coupon(), product(), {
    now: NOW,
    evidence: evidence({
      checkout: { success: 5, failure: 0 },
      lastSuccessAt: daysFromNow(-1),
      lastAttemptAt: daysFromNow(-1),
    }),
  });
  assert.ok(validated.confidence > reported.confidence);
  assert.match(validated.reasons.join(' '), /Aplicado com sucesso no checkout/);
});

test('checkout que falhou sempre derruba a confiança e vira bloqueio', () => {
  const match = matchCoupon(coupon(), product(), {
    now: NOW,
    evidence: evidence({ checkout: { success: 0, failure: 6 }, lastAttemptAt: daysFromNow(-1) }),
  });
  assert.ok(match.confidence < 0.2);
  assert.match(match.blockers.join(' '), /falhou todas as vezes/);
});

test('validação antiga pesa menos que validação recente', () => {
  const recent = matchCoupon(coupon(), product(), {
    now: NOW,
    evidence: evidence({
      checkout: { success: 6, failure: 0 },
      lastSuccessAt: daysFromNow(-1),
      lastAttemptAt: daysFromNow(-1),
    }),
  });
  const old = matchCoupon(coupon(), product(), {
    now: NOW,
    evidence: evidence({
      checkout: { success: 6, failure: 0 },
      lastSuccessAt: daysFromNow(-90),
      lastAttemptAt: daysFromNow(-90),
    }),
  });
  assert.ok(recent.confidence > old.confidence);
});

test('desconto observado aparece no resultado', () => {
  const match = matchCoupon(coupon(), product(), {
    now: NOW,
    evidence: evidence({
      checkout: { success: 3, failure: 0 },
      lastSuccessAt: daysFromNow(-1),
      lastAttemptAt: daysFromNow(-1),
      discountSamples: [100, 130, 120],
    }),
  });
  assert.equal(match.observedDiscount, 120);
  assert.match(match.reasons.join(' '), /Desconto observado no carrinho/);
});

test('medianDiscount lida com amostra par e vazia', () => {
  assert.equal(medianDiscount([]), null);
  assert.equal(medianDiscount([10, 20, 30, 40]), 25);
  assert.equal(medianDiscount([7]), 7);
});

test('evidenceScore não deixa amostra pequena virar certeza', () => {
  assert.equal(evidenceScore(0, 0), 0.5);
  // Um único sucesso sai do neutro, mas longe de virar certeza.
  assert.ok(evidenceScore(1, 0) > 0.6 && evidenceScore(1, 0) < 0.7);
  assert.ok(evidenceScore(1, 0) < evidenceScore(50, 0));
  assert.ok(evidenceScore(50, 0) > 0.95);
  assert.ok(evidenceScore(0, 20) < 0.05);
});

test('freshnessScore decai com o tempo', () => {
  assert.equal(freshnessScore(NOW.toISOString(), NOW), 1);
  assert.ok(freshnessScore(daysFromNow(-60), NOW) < 0.1);
  assert.ok(freshnessScore(daysFromNow(-2), NOW) > 0.85);
});

test('ranking coloca aplicáveis na frente e ordena por economia', () => {
  const matches = [
    matchCoupon(coupon({ id: 'a', rules: { minCartValue: 5000 } }), product(), { now: NOW }),
    matchCoupon(coupon({ id: 'b', value: 5 }), product(), { now: NOW }),
    matchCoupon(coupon({ id: 'c', value: 20 }), product(), { now: NOW }),
  ];
  const ranked = rankMatches(matches);
  assert.deepEqual(ranked.map((m) => m.coupon.id), ['c', 'b', 'a']);
});
