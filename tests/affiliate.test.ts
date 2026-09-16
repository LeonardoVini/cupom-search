import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildOutboundUrl } from '../src/core/affiliateLinks.ts';

afterEach(() => {
  delete process.env.AFFILIATE_PICHAU;
  delete process.env.AFFILIATE_AMAZON_BR;
  delete process.env.AWIN_PUBLISHER_ID;
});

test('sem configuração, devolve a própria URL com UTM', () => {
  const out = buildOutboundUrl('https://www.pichau.com.br/mesa', 'CUPOM10') ?? '';
  assert.match(out, /^https:\/\/www\.pichau\.com\.br\/mesa\?/);
  assert.match(out, /utm_source=cupom-search/);
  assert.match(out, /utm_campaign=CUPOM10/);
});

test('com deeplink de afiliado, passa pela rede', () => {
  process.env.AFFILIATE_PICHAU = 'awin:9999';
  process.env.AWIN_PUBLISHER_ID = '1234';
  const out = buildOutboundUrl('https://www.pichau.com.br/mesa') ?? '';
  assert.match(out, /^https:\/\/www\.awin1\.com\/cread\.php/);
  assert.match(out, /awinmid=9999/);
  assert.match(out, /awinaffid=1234/);
  assert.match(out, /ued=https%3A%2F%2Fwww\.pichau\.com\.br/);
});

test('tag de afiliado vira parâmetro na própria URL', () => {
  process.env.AFFILIATE_AMAZON_BR = 'tag:meucodigo-20';
  const out = buildOutboundUrl('https://www.amazon.com.br/dp/B000') ?? '';
  assert.match(out, /tag=meucodigo-20/);
});

test('recusa loja fora do catálogo e protocolo estranho', () => {
  assert.equal(buildOutboundUrl('https://evil.example.com/'), null);
  assert.equal(buildOutboundUrl('javascript:alert(1)'), null);
  assert.equal(buildOutboundUrl('não é url'), null);
});
