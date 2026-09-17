/**
 * Lógica pura da extensão, isolada do resto para poder ser testada fora do
 * navegador (ver tests/extension.test.ts, que roda estas funções com jsdom).
 *
 * A regra de ouro aqui: seletor da loja é atalho, heurística é a garantia.
 * Loja muda layout toda semana; o texto "cupom" perto do campo, não.
 */

const COUPON_HINT = /cupom|coupon|voucher|desconto|promo/i;
const APPLY_HINT = /aplicar|adicionar|ok|usar|validar/i;

/** "R$ 1.299,90" -> 1299.9 */
function parseBrl(text) {
  const match = String(text ?? '').match(/R\$\s*([\d.]+,\d{2}|[\d.]+)/);
  if (!match) return null;
  const raw = match[1];
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/\./g, '');
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

/**
 * "Na dúvida, visível". Só descartamos o que está declaradamente fora: desabilitado,
 * `hidden` ou `display:none`. Não usamos offsetParent/layout de propósito —
 * carrinho costuma esconder o campo de cupom atrás de um acordeão, e desistir
 * dele quebraria a extensão justamente nas lojas onde ela mais serve. Uma
 * tentativa a mais custa barato; um falso negativo custa a função inteira.
 */
function isVisible(element) {
  if (!element || element.disabled || element.hidden) return false;
  const style = element.ownerDocument?.defaultView?.getComputedStyle?.(element);
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  return true;
}

const REVEAL_HINT = /tenho (um )?cupom|cupom de desconto|adicionar cupom|inserir cupom|c[óo]digo promocional/i;

/**
 * Muitos carrinhos escondem o campo atrás de "Tenho um cupom". Clicar nesse
 * gatilho antes de procurar o campo resolve a maior parte dos casos.
 */
function revealCouponField(root) {
  const triggers = [...root.querySelectorAll('button, a, summary, [role="button"]')];
  const trigger = triggers.find((element) => REVEAL_HINT.test(element.textContent ?? ''));
  if (trigger) {
    trigger.click();
    return true;
  }
  return false;
}

/** Campo de cupom: tenta o seletor da loja, depois procura pelos rótulos. */
function findCouponField(root, store) {
  if (store?.couponField) {
    const preferred = [...root.querySelectorAll(store.couponField)].find(isVisible);
    if (preferred) return preferred;
  }
  const inputs = [...root.querySelectorAll('input[type="text"], input:not([type]), input[type="search"]')];
  return (
    inputs.find((input) => {
      if (!isVisible(input)) return false;
      const label = input.labels?.[0]?.textContent ?? '';
      const haystack = [
        input.name,
        input.id,
        input.placeholder,
        input.getAttribute('aria-label') ?? '',
        label,
      ].join(' ');
      return COUPON_HINT.test(haystack);
    }) ?? null
  );
}

/** Botão de aplicar: seletor da loja, senão o botão mais próximo do campo. */
function findApplyButton(root, store, field) {
  if (store?.applyButton) {
    const preferred = [...root.querySelectorAll(store.applyButton)].find(isVisible);
    if (preferred) return preferred;
  }
  const scope = field?.closest('form, div, section') ?? root;
  const buttons = [...scope.querySelectorAll('button, input[type="submit"], a[role="button"]')].filter(isVisible);
  return buttons.find((button) => APPLY_HINT.test(button.textContent || button.value || '')) ?? buttons[0] ?? null;
}

/** Total do carrinho: seletor da loja, senão o maior valor rotulado "total". */
function readCartTotal(root, store) {
  if (store?.totalSelector) {
    for (const node of root.querySelectorAll(store.totalSelector)) {
      const value = parseBrl(node.textContent);
      if (value !== null) return value;
    }
  }
  let best = null;
  for (const node of root.querySelectorAll('span, strong, b, p, div, td')) {
    if (node.children.length > 2) continue;
    const text = node.textContent ?? '';
    if (text.length > 120 || !/total/i.test(text)) continue;
    const value = parseBrl(text) ?? parseBrl(node.nextElementSibling?.textContent);
    if (value !== null && (best === null || value > best)) best = value;
  }
  return best;
}

/**
 * Campos controlados por React/Vue ignoram `input.value = x`. Escrever pelo
 * setter nativo e disparar os eventos é o que faz o framework enxergar.
 */
function setNativeValue(input, value) {
  const prototype = Object.getPrototypeOf(input);
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Desconto observado entre dois totais, ou null se não deu para medir. */
function discountBetween(before, after) {
  if (before === null || after === null) return null;
  return Math.round((before - after) * 100) / 100;
}

/**
 * Decide se um código funcionou. Precisa de duas medidas, porque uma só engana:
 *
 * - `baseline` é o total sem cupom nenhum, lido antes do primeiro teste. O
 *   desconto sai sempre contra ele. Medir contra o total anterior faz o segundo
 *   código parecer render menos — ou até "aumentar" o total — só porque o
 *   cupom anterior continuava aplicado.
 * - `before` é o total imediatamente antes deste código. Se nada mudou, a loja
 *   ignorou o código, mesmo que o carrinho ainda exiba o desconto do anterior.
 *
 * O preço dessa regra é um falso negativo quando dois códigos dão exatamente o
 * mesmo desconto. É melhor que creditar um código que a loja recusou.
 */
function evaluateAttempt({ baseline, before, after }) {
  const discount = discountBetween(baseline, after);
  const changed = before !== null && after !== null && Math.abs(after - before) > 0.009;
  return { worked: discount !== null && discount > 0.009 && changed, discount };
}

const CupomSearchLib = {
  parseBrl,
  revealCouponField,
  findCouponField,
  findApplyButton,
  readCartTotal,
  setNativeValue,
  discountBetween,
  evaluateAttempt,
};

if (typeof globalThis !== 'undefined') globalThis.CupomSearchLib = CupomSearchLib;
if (typeof module !== 'undefined') module.exports = CupomSearchLib;
