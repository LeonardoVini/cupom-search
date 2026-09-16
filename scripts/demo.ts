/**
 * Demonstração offline do pipeline, sem depender da rede: usa uma página de
 * produto salva em tests/fixtures e imprime o ranking no terminal.
 *
 *   node scripts/demo.ts
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extractProduct } from '../src/core/product.ts';
import { findStoreByUrl } from '../src/core/stores.ts';
import { collectCoupons, trustOf } from '../src/core/providers/index.ts';
import { matchCoupon, rankMatches } from '../src/core/matching.ts';
import { emptyEvidence, evidenceKey } from '../src/core/types.ts';

const URL_DEMO = 'https://www.pichau.com.br/mesa-gamer-pichau-kaiju-140cm-preta';
const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const html = await readFile(fileURLToPath(new URL('../tests/fixtures/pichau-mesa.html', import.meta.url)), 'utf8');
const product = extractProduct(URL_DEMO, html);
const store = findStoreByUrl(URL_DEMO);
if (!store) throw new Error('loja não catalogada');

const coupons = await collectCoupons(store);
const matches = rankMatches(
  coupons.map((coupon) => matchCoupon(coupon, product, { sourceTrust: trustOf(coupon.source) })),
);

console.log(`\n${product.title}`);
console.log(`${product.storeName} · ${product.price ? brl(product.price) : 'preço não lido'} · ${product.categories.slice(0, 4).join(', ')}\n`);

for (const match of matches) {
  const head = [
    match.coupon.code.padEnd(20),
    `${String(Math.round(match.confidence * 100)).padStart(3)}%`,
    match.estimatedSavings ? `-${brl(match.estimatedSavings)}` : '  —     ',
    match.finalPrice !== null ? `→ ${brl(match.finalPrice)}` : '',
  ].join('  ');
  console.log(`${match.applicable ? '✅' : '❌'} ${head}`);
  console.log(`   ${match.coupon.description}`);
  for (const reason of match.reasons) console.log(`   + ${reason}`);
  for (const blocker of match.blockers) console.log(`   - ${blocker}`);
  console.log();
}

// ---------------------------------------------------------------------------
// O que muda quando a extensão testa o código no carrinho de verdade.
// ---------------------------------------------------------------------------
const alvo = coupons.find((coupon) => coupon.code === 'DEMO-PERIFERICOS10');
if (alvo) {
  const semTeste = matchCoupon(alvo, product, { sourceTrust: trustOf(alvo.source) });
  const ontem = new Date(Date.now() - 86_400_000).toISOString();
  const comTeste = matchCoupon(alvo, product, {
    sourceTrust: trustOf(alvo.source),
    evidence: {
      ...emptyEvidence(evidenceKey(alvo.storeId, alvo.code)),
      checkout: { success: 4, failure: 0 },
      lastSuccessAt: ontem,
      lastAttemptAt: ontem,
      discountSamples: [129.99, 129.99, 130.0],
    },
  });
  console.log('--- efeito da validação no checkout (extensão) ---');
  console.log(`sem teste:  ${Math.round(semTeste.confidence * 100)}% de confiança, economia estimada`);
  console.log(
    `com teste:  ${Math.round(comTeste.confidence * 100)}% de confiança, desconto observado ${brl(comTeste.observedDiscount ?? 0)}`,
  );
  const prova = comTeste.reasons.find((reason) => reason.startsWith('Aplicado com sucesso'));
  console.log(`            "${prova}"`);
}
