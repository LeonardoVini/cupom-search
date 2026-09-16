/** Endereço da API. Trocável pelo popup e guardado em chrome.storage. */
const DEFAULT_API = 'http://localhost:3000';

async function getApiBase() {
  try {
    const stored = await chrome.storage.sync.get('apiBase');
    return (stored.apiBase || DEFAULT_API).replace(/\/+$/, '');
  } catch {
    return DEFAULT_API;
  }
}

async function setApiBase(value) {
  await chrome.storage.sync.set({ apiBase: String(value).replace(/\/+$/, '') });
}

if (typeof globalThis !== 'undefined') globalThis.CupomSearchConfig = { DEFAULT_API, getApiBase, setApiBase };
