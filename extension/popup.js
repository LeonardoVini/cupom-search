const sub = document.getElementById('sub');
const list = document.getElementById('list');
const apiInput = document.getElementById('api');

const brl = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function hostToStoreId(host, stores) {
  const clean = host.replace(/^www\./, '');
  return stores.find((store) => store.domains.some((domain) => clean === domain || clean.endsWith(`.${domain}`)));
}

async function main() {
  const base = await globalThis.CupomSearchConfig.getApiBase();
  apiInput.value = base;
  apiInput.addEventListener('change', async () => {
    await globalThis.CupomSearchConfig.setApiBase(apiInput.value);
    location.reload();
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;
  const url = new URL(tab.url);

  let stores;
  try {
    ({ stores } = await (await fetch(`${base}/api/stores`)).json());
  } catch {
    sub.textContent = 'API fora do ar. Confira o endereço abaixo.';
    return;
  }

  const store = hostToStoreId(url.hostname, stores);
  if (!store) {
    sub.textContent = 'Esta loja ainda não está no catálogo.';
    return;
  }

  // Em página de produto, o ranking considera preço e categoria.
  // Em qualquer outra, mostramos os cupons gerais da loja.
  let matches = [];
  try {
    const res = await fetch(`${base}/api/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: tab.url }),
    });
    if (res.ok) ({ matches } = await res.json());
    else ({ matches } = await (await fetch(`${base}/api/coupons?storeId=${store.id}`)).json());
  } catch {
    sub.textContent = 'Não consegui buscar os cupons.';
    return;
  }

  sub.textContent = matches.length
    ? `${matches.length} cupom(ns) para ${store.name}.`
    : `Nenhum cupom conhecido para ${store.name}.`;

  list.replaceChildren(
    ...matches.map((match) => {
      const item = document.createElement('li');
      const pct = Math.round(match.confidence * 100);
      const savings = match.observedDiscount ?? match.estimatedSavings;
      item.innerHTML = `
        <div class="code">${match.coupon.code}</div>
        <div class="meta">${match.coupon.description}</div>
        <div class="meta">${pct}% de confiança${savings ? ` · ${brl(savings)} off` : ''}</div>
        <div class="bar"><span style="width:${pct}%"></span></div>
      `;
      item.addEventListener('click', () => navigator.clipboard.writeText(match.coupon.code));
      return item;
    }),
  );
}

main();
