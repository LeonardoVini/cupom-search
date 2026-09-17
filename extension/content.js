/**
 * Roda dentro da página da loja. No carrinho, oferece testar os cupons
 * conhecidos: aplica cada código no campo real, lê quanto o total caiu e manda
 * o resultado para a API.
 *
 * Duas decisões importantes:
 * - Nada roda sozinho. O teste só começa quando a pessoa clica — o objetivo é
 *   ajudar quem já está comprando, não gerar tráfego automático para a loja.
 * - Nenhum passo avança a compra. A extensão preenche cupom e lê o total; ela
 *   nunca clica em "finalizar pedido".
 */
(() => {
  const { storeForHost, looksLikeCart } = globalThis.CupomSearchStores ?? {};
  const store = storeForHost?.(location.hostname);
  if (!store || !looksLikeCart(store, location.pathname)) return;
  if (document.getElementById('cupom-search-panel')) return;

  const MAX_CODES = 8;
  const APPLY_TIMEOUT_MS = 6000;
  const lib = globalThis.CupomSearchLib;
  const brl = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const findCouponField = () => {
    lib.revealCouponField(document);
    return lib.findCouponField(document, store);
  };
  const findApplyButton = (field) => lib.findApplyButton(document, store, field);
  const readCartTotal = () => lib.readCartTotal(document, store);

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Espera o total mudar (ou o tempo acabar) depois de aplicar o código. */
  async function waitForTotalChange(before) {
    const deadline = Date.now() + APPLY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(400);
      const current = readCartTotal();
      if (current !== null && before !== null && Math.abs(current - before) > 0.009) return current;
    }
    return readCartTotal();
  }

  /**
   * Toda ida à API passa pelo service worker (ver background.js): content
   * script no MV3 esbarra no CORS da própria loja.
   */
  function ask(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const failure = chrome.runtime.lastError;
        if (failure) return reject(new Error(failure.message));
        if (!response?.ok) return reject(new Error(response?.error ?? 'falha na API'));
        resolve(response.data);
      });
    });
  }

  function report(code, worked, discount, cartTotal) {
    return ask({
      type: 'validation',
      payload: { storeId: store.id, code, worked, discount, cartTotal, method: 'extension' },
    }).catch(() => {});
  }

  // ----- painel -----
  const panel = document.createElement('div');
  panel.id = 'cupom-search-panel';
  panel.innerHTML = `
    <button class="cs-close" title="Fechar">×</button>
    <h2>Cupom Search</h2>
    <p class="cs-sub" data-role="sub">Procurando cupons para ${store.name}...</p>
    <button class="cs-primary" data-role="run" disabled>Aguarde</button>
    <div data-role="result"></div>
    <ol data-role="log"></ol>
  `;
  document.body.append(panel);

  const sub = panel.querySelector('[data-role="sub"]');
  const runButton = panel.querySelector('[data-role="run"]');
  const log = panel.querySelector('[data-role="log"]');
  const result = panel.querySelector('[data-role="result"]');
  panel.querySelector('.cs-close').addEventListener('click', () => panel.remove());

  let codes = [];

  ask({ type: 'coupons', storeId: store.id })
    .then(({ matches }) => {
      codes = (matches ?? []).map((match) => match.coupon.code).slice(0, MAX_CODES);
      if (!codes.length) {
        sub.textContent = 'Nenhum cupom conhecido para esta loja ainda.';
        return;
      }
      sub.textContent = `${codes.length} código(s) para testar no seu carrinho.`;
      runButton.disabled = false;
      runButton.textContent = `Testar ${codes.length} cupons`;
    })
    .catch(() => {
      sub.textContent = 'Não consegui falar com a API do Cupom Search.';
    });

  runButton.addEventListener('click', async () => {
    runButton.disabled = true;
    log.replaceChildren();

    const field = findCouponField();
    if (!field) {
      sub.textContent = 'Não achei o campo de cupom nesta página. Abra o carrinho e tente de novo.';
      runButton.disabled = false;
      return;
    }
    const button = findApplyButton(field);
    // Total sem cupom nenhum: é contra ele que todo desconto é medido.
    const baseline = readCartTotal();
    let best = null;

    for (const [index, code] of codes.entries()) {
      runButton.textContent = `Testando ${index + 1}/${codes.length}: ${code}`;
      const before = readCartTotal() ?? baseline;
      lib.setNativeValue(field, code);
      button?.click();
      const after = await waitForTotalChange(before);
      const { worked, discount } = lib.evaluateAttempt({ baseline, before, after });

      const item = document.createElement('li');
      item.className = worked ? 'cs-win' : 'cs-lose';
      item.textContent = worked ? `${code} — ${brl(discount)} off` : `${code} — sem desconto`;
      log.append(item);

      if (worked && (best === null || discount > best.discount)) best = { code, discount, total: after };
      await report(code, worked, discount, after);
      await sleep(600);
    }

    if (best) {
      // Deixa aplicado o melhor código encontrado.
      lib.setNativeValue(field, best.code);
      button?.click();
      result.className = 'cs-result';
      result.textContent = `Melhor cupom: ${best.code} — economia de ${brl(best.discount)}. Já deixei aplicado.`;
    } else {
      result.className = 'cs-result';
      result.textContent = 'Nenhum dos códigos deu desconto neste carrinho. Registrei isso para avisar os próximos.';
    }
    runButton.textContent = 'Testar de novo';
    runButton.disabled = false;
  });
})();
