/**
 * Mapa de lojas para a extensão.
 *
 * Os seletores são o *atalho*: quando batem, o teste é preciso. Quando não
 * batem (a loja mudou o layout, que é o normal), o content script cai na
 * heurística de `content.js`, que acha o campo de cupom pelo texto do rótulo,
 * name, id ou placeholder. Por isso a extensão não quebra a cada deploy da loja.
 */
const STORE_RULES = [
  {
    id: 'pichau',
    name: 'Pichau',
    domain: 'pichau.com.br',
    cartPaths: ['/checkout', '/carrinho'],
    couponField: 'input[name="coupon_code"], #coupon_code',
    applyButton: 'button[value="Aplicar"], button[data-testid="apply-coupon"]',
    totalSelector: '[data-testid="cart-total"], .grand.totals .price',
  },
  {
    id: 'kabum',
    name: 'KaBuM!',
    domain: 'kabum.com.br',
    cartPaths: ['/carrinho', '/checkout'],
    couponField: 'input[name="cupom"], input[id*="cupom" i]',
    applyButton: 'button[type="submit"]',
    totalSelector: '[class*="total" i] [class*="valor" i]',
  },
  {
    id: 'terabyte',
    name: 'Terabyte Shop',
    domain: 'terabyteshop.com.br',
    cartPaths: ['/carrinho'],
    couponField: 'input[name="cupom"]',
    applyButton: 'button[name="aplicar"]',
    totalSelector: '#total-carrinho, [class*="total" i]',
  },
  {
    id: 'madeiramadeira',
    name: 'MadeiraMadeira',
    domain: 'madeiramadeira.com.br',
    cartPaths: ['/carrinho', '/checkout'],
    couponField: 'input[name*="cupom" i], input[placeholder*="cupom" i]',
    applyButton: 'button[class*="cupom" i], button[type="submit"]',
    totalSelector: '[class*="total" i]',
  },
  {
    id: 'magalu',
    name: 'Magazine Luiza',
    domain: 'magazineluiza.com.br',
    cartPaths: ['/carrinho', '/checkout'],
    couponField: 'input[name*="cupom" i], input[placeholder*="cupom" i]',
    applyButton: 'button[data-testid*="cupom" i], button[type="submit"]',
    totalSelector: '[data-testid*="total" i]',
  },
  {
    id: 'mobly',
    name: 'Mobly',
    domain: 'mobly.com.br',
    cartPaths: ['/carrinho', '/checkout'],
    couponField: 'input[name*="cupom" i], input[placeholder*="cupom" i]',
    applyButton: 'button[type="submit"]',
    totalSelector: '[class*="total" i]',
  },
];

/** Resolve a loja pelo host atual. */
function storeForHost(host) {
  const clean = String(host || '').toLowerCase().replace(/^www\./, '');
  return STORE_RULES.find((rule) => clean === rule.domain || clean.endsWith(`.${rule.domain}`)) ?? null;
}

/** Heurística: a URL parece ser carrinho/checkout? */
function looksLikeCart(store, pathname) {
  const path = String(pathname || '').toLowerCase();
  const known = (store?.cartPaths ?? []).some((cartPath) => path.startsWith(cartPath));
  return known || /carrinho|checkout|cart|sacola/.test(path);
}

if (typeof globalThis !== 'undefined') {
  globalThis.CupomSearchStores = { STORE_RULES, storeForHost, looksLikeCart };
}
if (typeof module !== 'undefined') module.exports = { STORE_RULES, storeForHost, looksLikeCart };
