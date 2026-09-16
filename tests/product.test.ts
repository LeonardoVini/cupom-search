import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePrice, extractProduct, deriveCategories } from '../src/core/product.ts';

test('parsePrice entende os formatos que aparecem nas lojas', () => {
  assert.equal(parsePrice('R$ 1.299,90'), 1299.9);
  assert.equal(parsePrice('1299.90'), 1299.9);
  assert.equal(parsePrice('R$ 2.499'), 2499);
  assert.equal(parsePrice(349.5), 349.5);
  assert.equal(parsePrice('grátis'), null);
  assert.equal(parsePrice(''), null);
  assert.equal(parsePrice(null), null);
});

test('extractProduct lê JSON-LD de produto', () => {
  const html = `
    <html><head><script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Product","name":"Mesa Gamer Pichau Kaiju",
     "sku":"PG-1234","category":"Móveis > Mesas",
     "offers":{"@type":"Offer","price":"1299.90","priceCurrency":"BRL"}}
    </script></head><body></body></html>`;
  const product = extractProduct('https://www.pichau.com.br/mesa-gamer-kaiju', html);
  assert.equal(product.source, 'json-ld');
  assert.equal(product.storeId, 'pichau');
  assert.equal(product.title, 'Mesa Gamer Pichau Kaiju');
  assert.equal(product.price, 1299.9);
  assert.equal(product.sku, 'PG-1234');
  assert.ok(product.categories.includes('moveis'));
});

test('extractProduct cai para Open Graph quando não há JSON-LD', () => {
  const html = `<html><head>
    <meta property="og:title" content="Cadeira de Escrit&#243;rio" />
    <meta property="product:price:amount" content="899,00" />
  </head></html>`;
  const product = extractProduct('https://www.kabum.com.br/produto/1', html);
  assert.equal(product.source, 'open-graph');
  assert.equal(product.title, 'Cadeira de Escritório');
  assert.equal(product.price, 899);
});

test('extractProduct usa heurística como último recurso', () => {
  const html = '<html><head><title>Mesa X - Loja</title></head><body><span>R$ 450,00</span></body></html>';
  const product = extractProduct('https://www.pichau.com.br/x', html);
  assert.equal(product.source, 'heuristic');
  assert.equal(product.price, 450);
});

test('deriveCategories ignora ruído de URL', () => {
  const tags = deriveCategories(null, 'Mesa', 'https://www.pichau.com.br/produto/mesa');
  assert.ok(!tags.includes('https'));
  assert.ok(!tags.includes('produto'));
  assert.ok(tags.includes('moveis'));
});
