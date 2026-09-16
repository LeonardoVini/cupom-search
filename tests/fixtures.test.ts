import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isOfflineDemo, offlineFixture } from '../src/core/fixtures.ts';
import { fetchHtml, FetchError } from '../src/core/fetcher.ts';

afterEach(() => {
  delete process.env.DEMO_OFFLINE;
});

test('modo offline só liga com DEMO_OFFLINE=1', () => {
  assert.equal(isOfflineDemo(), false);
  process.env.DEMO_OFFLINE = '1';
  assert.equal(isOfflineDemo(), true);
});

test('serve a página salva da loja conhecida', () => {
  const html = offlineFixture('https://www.pichau.com.br/qualquer-produto');
  assert.match(html ?? '', /Mesa Gamer Pichau Kaiju/);
});

test('loja sem página salva devolve null', () => {
  assert.equal(offlineFixture('https://www.mobly.com.br/x'), null);
  assert.equal(offlineFixture('https://desconhecida.com/x'), null);
});

test('fetchHtml em modo offline não vai à rede e explica o que falta', async () => {
  process.env.DEMO_OFFLINE = '1';
  assert.match(await fetchHtml('https://www.pichau.com.br/mesa'), /Kaiju/);
  await assert.rejects(() => fetchHtml('https://www.mobly.com.br/x'), (error: unknown) => {
    assert.ok(error instanceof FetchError);
    assert.match(error.message, /Modo demonstração/);
    return true;
  });
});
