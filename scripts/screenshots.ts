/**
 * Abre o sistema num navegador de verdade e salva as telas em docs/screenshots/.
 *
 * Inclui o fluxo da extensão: carrega os mesmos arquivos de `extension/` numa
 * página de carrinho simulada (fixtures/pichau-cart.html servida no domínio da
 * loja via interceptação de rede) e clica no botão de testar cupons.
 *
 *   DEMO_OFFLINE=1 npm start &
 *   node scripts/screenshots.ts
 */
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const API = process.env.API_BASE ?? 'http://localhost:3000';
const OUT = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
const root = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));

await mkdir(OUT, { recursive: true });
// O ambiente pode ter um Chromium próprio (CHROMIUM_PATH); senão usa o do Playwright.
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);

// ---------- 1. o site ----------
const web = await browser.newPage({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 2 });
await web.goto(`${API}/`);
await web.screenshot({ path: `${OUT}01-home.png` });

await web.fill('#url', 'https://www.pichau.com.br/mesa-gamer-pichau-kaiju-140cm-preta');
await web.click('#submit');
await web.waitForSelector('#results .coupon');
await web.screenshot({ path: `${OUT}02-resultado.png`, fullPage: true });
await web.close();

// ---------- 2. a extensão no carrinho ----------
const store = await browser.newPage({ viewport: { width: 900, height: 820 }, deviceScaleFactor: 2 });
store.on('console', (message) => {
  if (message.type() === 'error') console.error('[loja]', message.text());
});
const cartHtml = await readFile(root('fixtures/pichau-cart.html'), 'utf8');

// Serve o carrinho simulado no domínio da loja: assim o content script roda
// exatamente como rodaria na Pichau, sem tocar no site real.
await store.route('http://www.pichau.com.br/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: cartHtml }),
);
await store.goto('http://www.pichau.com.br/checkout/cart');

// Mesmos arquivos que o manifest injeta na loja.
await store.addStyleTag({ content: await readFile(root('extension/content.css'), 'utf8') });
for (const file of ['extension/lib.js', 'extension/stores.js']) {
  await store.addScriptTag({ content: await readFile(root(file), 'utf8') });
}

// No navegador real, `chrome.runtime.sendMessage` leva o pedido ao service
// worker (background.js), que faz o fetch com as permissões da extensão. Aqui
// não existe runtime de extensão, então quem responde é o próprio Node — o
// content script não sabe a diferença, é a mesma mensagem.
await store.exposeFunction('__cupomSearchApi', async (message: { type: string; storeId?: string; payload?: unknown }) => {
  if (message.type === 'coupons') {
    return (await fetch(`${API}/api/coupons?storeId=${message.storeId}`)).json();
  }
  return (
    await fetch(`${API}/api/validations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(message.payload),
    })
  ).json();
});

await store.evaluate(() => {
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      lastError: undefined,
      sendMessage(message: unknown, callback: (response: unknown) => void) {
        (globalThis as unknown as { __cupomSearchApi: (m: unknown) => Promise<unknown> })
          .__cupomSearchApi(message)
          .then((data) => callback({ ok: true, data }))
          .catch((error) => callback({ ok: false, error: String(error) }));
      },
    },
  };
});

await store.addScriptTag({ content: await readFile(root('extension/content.js'), 'utf8') });

await store.waitForSelector('#cupom-search-panel [data-role="run"]:not([disabled])');
await store.screenshot({ path: `${OUT}03-extensao-carrinho.png` });

await store.click('#cupom-search-panel [data-role="run"]');
await store.waitForSelector('#cupom-search-panel .cs-result', { timeout: 120_000 });
await store.screenshot({ path: `${OUT}04-extensao-resultado.png` });
await store.close();

// ---------- 3. o site depois que a extensão validou ----------
const after = await browser.newPage({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 2 });
await after.goto(`${API}/`);
await after.fill('#url', 'https://www.pichau.com.br/mesa-gamer-pichau-kaiju-140cm-preta');
await after.click('#submit');
await after.waitForSelector('#results .coupon');
await after.screenshot({ path: `${OUT}05-apos-validacao.png`, fullPage: true });
await after.close();

await browser.close();
console.log(`telas salvas em ${OUT}`);
