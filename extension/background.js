/**
 * Service worker: só guarda a configuração e mantém o ícone coerente.
 * A conversa com a API acontece no content script e no popup.
 */
chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get('apiBase');
  if (!stored.apiBase) await chrome.storage.sync.set({ apiBase: 'http://localhost:3000' });
});
