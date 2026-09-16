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
