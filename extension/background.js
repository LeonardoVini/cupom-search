/**
 * Service worker: é ele quem fala com a API.
 *
 * No Manifest V3 o content script está sujeito ao CORS da página, então um
 * `fetch` daqui de dentro da loja para o nosso servidor seria bloqueado (foi o
 * que aconteceu no primeiro teste). O service worker roda com as
 * `host_permissions` da extensão e não tem esse limite — por isso o content
 * script pede as coisas por mensagem, e a resposta volta por aqui.
 */
const DEFAULT_API = 'http://localhost:3000';

async function apiBase() {
  try {
    const stored = await chrome.storage.sync.get('apiBase');
    return String(stored.apiBase || DEFAULT_API).replace(/\/+$/, '');
  } catch {
    return DEFAULT_API;
  }
}

async function handle(message) {
  const base = await apiBase();

  if (message?.type === 'coupons') {
    const res = await fetch(`${base}/api/coupons?storeId=${encodeURIComponent(message.storeId)}`);
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return res.json();
  }

  if (message?.type === 'validation') {
    const res = await fetch(`${base}/api/validations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(message.payload),
    });
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    return res.json();
  }

  throw new Error(`mensagem desconhecida: ${message?.type}`);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handle(message)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: String(error.message ?? error) }));
  // true = a resposta vem depois (assíncrona).
  return true;
});

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get('apiBase');
  if (!stored.apiBase) await chrome.storage.sync.set({ apiBase: DEFAULT_API });
});
