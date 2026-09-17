import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const lib = require('../extension/lib.js');
const { storeForHost, looksLikeCart } = require('../extension/stores.js');

const pichau = storeForHost('www.pichau.com.br');

function dom(html: string): Document {
  return new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
}

test('storeForHost aceita subdomínio e recusa domínio parecido', () => {
  assert.equal(storeForHost('www.pichau.com.br').id, 'pichau');
  assert.equal(storeForHost('loja.kabum.com.br').id, 'kabum');
  assert.equal(storeForHost('naoepichau.com.br'), null);
  assert.equal(storeForHost(''), null);
});

test('looksLikeCart reconhece carrinho e ignora página de produto', () => {
  assert.equal(looksLikeCart(pichau, '/checkout/cart'), true);
  assert.equal(looksLikeCart(pichau, '/carrinho'), true);
  assert.equal(looksLikeCart(pichau, '/sacola'), true);
  assert.equal(looksLikeCart(pichau, '/mesa-gamer-kaiju'), false);
});

test('parseBrl entende os formatos do carrinho', () => {
  assert.equal(lib.parseBrl('Total: R$ 1.299,90'), 1299.9);
  assert.equal(lib.parseBrl('R$ 89,00'), 89);
  assert.equal(lib.parseBrl('R$ 1.500'), 1500);
  assert.equal(lib.parseBrl('sem valor'), null);
});

test('acha o campo de cupom pelo seletor da loja', () => {
  const document = dom('<input name="outro"><input name="coupon_code">');
  const field = lib.findCouponField(document, pichau);
  assert.equal(field.getAttribute('name'), 'coupon_code');
});

test('quando o seletor da loja falha, acha pelo placeholder', () => {
  const document = dom('<input name="cep"><input name="xyz" placeholder="Digite seu cupom">');
  const field = lib.findCouponField(document, pichau);
  assert.equal(field.getAttribute('name'), 'xyz');
});

test('acha o campo pelo texto do label', () => {
  const document = dom('<label for="a">Código de desconto</label><input id="a">');
  assert.equal(lib.findCouponField(document, null).id, 'a');
});

test('não confunde campo de e-mail com campo de cupom', () => {
  const document = dom('<input name="email" placeholder="Seu e-mail"><input name="cep">');
  assert.equal(lib.findCouponField(document, null), null);
});

test('acha o botão de aplicar pelo texto, dentro do mesmo bloco', () => {
  const document = dom(`
    <div><button>Finalizar compra</button></div>
    <form><input name="coupon_code"><button>Aplicar</button></form>
  `);
  const field = lib.findCouponField(document, pichau);
  const button = lib.findApplyButton(document, null, field);
  assert.equal(button.textContent, 'Aplicar');
});

test('lê o total pelo seletor da loja', () => {
  const document = dom('<div data-testid="cart-total">R$ 1.199,90</div>');
  assert.equal(lib.readCartTotal(document, pichau), 1199.9);
});

test('sem seletor, lê o maior valor rotulado como total', () => {
  const document = dom(`
    <span>Subtotal R$ 1.000,00</span>
    <span>Frete R$ 50,00</span>
    <span>Total do pedido R$ 1.050,00</span>
  `);
  assert.equal(lib.readCartTotal(document, null), 1050);
});

test('lê o total quando o valor está no elemento vizinho', () => {
  const document = dom('<div><span>Total</span><span>R$ 742,30</span></div>');
  assert.equal(lib.readCartTotal(document, null), 742.3);
});

test('setNativeValue dispara os eventos que frameworks escutam', () => {
  const window = new JSDOM('<!doctype html><body><input id="a"></body>').window;
  const input = window.document.getElementById('a') as HTMLInputElement;
  const seen: string[] = [];
  input.addEventListener('input', () => seen.push('input'));
  input.addEventListener('change', () => seen.push('change'));
  // jsdom expõe Event no window; a lib usa o global do documento em execução.
  globalThis.Event = window.Event;
  lib.setNativeValue(input, 'CUPOM10');
  assert.equal(input.value, 'CUPOM10');
  assert.deepEqual(seen, ['input', 'change']);
});

test('discountBetween mede a queda do total e tolera medida ausente', () => {
  assert.equal(lib.discountBetween(1000, 900), 100);
  assert.equal(lib.discountBetween(1000, 1000), 0);
  assert.equal(lib.discountBetween(null, 900), null);
});

test('todas as lojas da extensão existem no catálogo do servidor', async () => {
  const { STORES } = await import('../src/core/stores.ts');
  const { STORE_RULES } = require('../extension/stores.js');
  for (const rule of STORE_RULES) {
    const store = STORES.find((candidate) => candidate.id === rule.id);
    assert.ok(store, `loja ${rule.id} não está em src/core/stores.ts`);
    assert.ok(store.domains.includes(rule.domain), `domínio divergente em ${rule.id}`);
  }
});

test('revealCouponField abre o acordeão "Tenho um cupom" antes de procurar', () => {
  const document = dom(`
    <button id="toggle">Tenho um cupom</button>
    <div id="box" style="display:none"><input name="cupom"></div>
  `);
  const box = document.getElementById('box') as HTMLElement;
  document.getElementById('toggle')!.addEventListener('click', () => (box.style.display = 'block'));

  assert.equal(box.style.display, 'none');
  assert.equal(lib.revealCouponField(document), true);
  assert.equal(box.style.display, 'block');
  assert.equal(lib.findCouponField(document, null)?.getAttribute('name'), 'cupom');
});

test('revealCouponField não clica em nada quando não há gatilho', () => {
  const document = dom('<button>Finalizar compra</button>');
  assert.equal(lib.revealCouponField(document), false);
});

test('campo com display:none é preterido quando há alternativa visível', () => {
  const document = dom(`
    <input name="cupom-oculto" style="display:none">
    <input name="cupom-visivel">
  `);
  assert.equal(lib.findCouponField(document, null)?.getAttribute('name'), 'cupom-visivel');
});

test('evaluateAttempt mede o desconto contra o carrinho sem cupom', () => {
  // Primeiro código: 1299,90 -> 1169,91.
  assert.deepEqual(lib.evaluateAttempt({ baseline: 1299.9, before: 1299.9, after: 1169.91 }), {
    worked: true,
    discount: 129.99,
  });

  // Segundo código, com o anterior ainda aplicado: o total sobe, mas o cupom
  // funciona e vale R$ 65 — medir contra o total anterior diria o contrário.
  assert.deepEqual(lib.evaluateAttempt({ baseline: 1299.9, before: 1169.91, after: 1234.9 }), {
    worked: true,
    discount: 65,
  });
});

test('evaluateAttempt não credita código que a loja ignorou', () => {
  // Nada mudou: a loja recusou, mesmo com desconto anterior ainda na tela.
  assert.equal(lib.evaluateAttempt({ baseline: 1299.9, before: 1169.91, after: 1169.91 }).worked, false);
  // Voltou ao total cheio: código inválido.
  assert.equal(lib.evaluateAttempt({ baseline: 1299.9, before: 1169.91, after: 1299.9 }).worked, false);
  // Sem leitura do total: não dá para afirmar nada.
  assert.equal(lib.evaluateAttempt({ baseline: null, before: 1299.9, after: 1169.91 }).worked, false);
});
