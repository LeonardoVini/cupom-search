const form = document.querySelector('#search-form');
const input = document.querySelector('#url');
const submit = document.querySelector('#submit');
const statusEl = document.querySelector('#status');
const productEl = document.querySelector('#product');
const warningsEl = document.querySelector('#warnings');
const resultsEl = document.querySelector('#results');

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const url = input.value.trim();
  if (!url) return;

  submit.disabled = true;
  statusEl.textContent = 'Lendo a página e cruzando com os cupons conhecidos...';
  productEl.hidden = true;
  warningsEl.replaceChildren();
  resultsEl.replaceChildren();

  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Falha na busca.');
    render(data);
  } catch (err) {
    statusEl.textContent = err.message;
  } finally {
    submit.disabled = false;
  }
});

function render({ product, matches, warnings }) {
  const usable = matches.filter((m) => m.applicable).length;
  statusEl.textContent = matches.length
    ? `${matches.length} cupom(ns) conhecido(s) para esta loja — ${usable} com chance de valer neste produto.`
    : 'Nenhum cupom conhecido para esta loja ainda.';

  productEl.hidden = false;
  productEl.className = 'card';
  productEl.replaceChildren(
    el('h2', { class: 'product-title' }, product.title ?? 'Produto sem título identificado'),
    el(
      'p',
      { class: 'product-meta' },
      [product.storeName, product.price !== null ? brl.format(product.price) : 'preço não identificado',
       product.categories.length ? product.categories.slice(0, 4).join(' · ') : null]
        .filter(Boolean)
        .join(' — '),
    ),
  );

  for (const warning of warnings) {
    warningsEl.append(el('div', { class: 'warning' }, warning));
  }

  for (const match of matches) resultsEl.append(couponCard(match));
}

function couponCard(match) {
  const { coupon, confidence, estimatedSavings, finalPrice, reasons, blockers, applicable } = match;
  const pct = Math.round(confidence * 100);
  const level = pct >= 66 ? '' : pct >= 33 ? 'mid' : 'low';

  const head = el('div', { class: 'coupon-head' },
    el('code', { class: 'code' }, coupon.code),
    coupon.demo ? el('span', { class: 'badge demo' }, 'demo') : null,
    estimatedSavings ? el('span', { class: 'badge savings' }, `-${brl.format(estimatedSavings)}`) : null,
    finalPrice !== null ? el('span', { class: 'badge' }, `fica ${brl.format(finalPrice)}`) : null,
    !applicable ? el('span', { class: 'badge' }, 'provavelmente não vale') : null,
  );

  const bar = el('div', { class: `bar ${level}` }, el('span', { style: `width:${pct}%` }, ''));
  const list = el('ul', { class: 'reasons' },
    ...reasons.map((text) => el('li', {}, text)),
    ...blockers.map((text) => el('li', { class: 'blocker' }, text)),
  );

  const copy = el('button', { type: 'button' }, 'Copiar código');
  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(coupon.code).catch(() => {});
    copy.textContent = 'Copiado!';
    setTimeout(() => (copy.textContent = 'Copiar código'), 1500);
  });

  const worked = el('button', { type: 'button' }, 'Funcionou');
  const failed = el('button', { type: 'button' }, 'Não funcionou');
  for (const [button, value] of [[worked, true], [failed, false]]) {
    button.addEventListener('click', async () => {
      worked.disabled = true;
      failed.disabled = true;
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ couponId: coupon.id, worked: value }),
      }).catch(() => {});
      button.textContent = 'Obrigado!';
    });
  }

  return el('article', { class: `card coupon${applicable ? '' : ' blocked'}` },
    head,
    el('p', { class: 'product-meta' }, coupon.description),
    el('div', { class: 'confidence' }, el('span', {}, `confiança ${pct}%`), bar),
    list,
    el('div', { class: 'actions' }, copy, worked, failed),
  );
}

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) node.setAttribute(key, value);
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

fetch('/api/stores')
  .then((res) => res.json())
  .then(({ stores }) => {
    document.querySelector('#stores').replaceChildren(
      ...stores.map((store) => el('li', {}, `${store.name} (${store.domains[0]})`)),
    );
  })
  .catch(() => {});
