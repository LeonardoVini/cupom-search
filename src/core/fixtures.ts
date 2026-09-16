import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { findStoreByUrl } from './stores.ts';

/**
 * Modo demonstração (`DEMO_OFFLINE=1`): em vez de buscar a página na loja,
 * o servidor lê uma página salva em `fixtures/`. Serve para rodar o app
 * inteiro sem rede — em apresentação, em ambiente bloqueado, ou em CI.
 *
 * Nunca ligue isso em produção: os preços são os do arquivo, não os da loja.
 */
const FIXTURES: Record<string, string> = {
  pichau: 'pichau-mesa.html',
};

export function isOfflineDemo(): boolean {
  return process.env.DEMO_OFFLINE === '1';
}

export function offlineFixture(rawUrl: string): string | null {
  const store = findStoreByUrl(rawUrl);
  const file = store ? FIXTURES[store.id] : undefined;
  if (!file) return null;
  try {
    return readFileSync(fileURLToPath(new URL(`../../fixtures/${file}`, import.meta.url)), 'utf8');
  } catch {
    return null;
  }
}
