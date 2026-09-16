import type { Store } from './types.ts';

/**
 * Registro de lojas suportadas. `checkoutCouponField` é o seletor do campo de
 * cupom no checkout — só é usado pela extensão de navegador (roadmap), que
 * testa os códigos dentro da sessão do próprio usuário.
 */
export const STORES: Store[] = [
  {
    id: 'pichau',
    name: 'Pichau',
    domains: ['pichau.com.br'],
    affiliateNetwork: 'awin',
    checkoutCouponField: 'input[name="coupon_code"]',
  },
  { id: 'kabum', name: 'KaBuM!', domains: ['kabum.com.br'], affiliateNetwork: 'awin' },
  { id: 'terabyte', name: 'Terabyte Shop', domains: ['terabyteshop.com.br'] },
  { id: 'amazon-br', name: 'Amazon Brasil', domains: ['amazon.com.br'], affiliateNetwork: 'amazon-associates' },
  { id: 'magalu', name: 'Magazine Luiza', domains: ['magazineluiza.com.br', 'magalu.com'], affiliateNetwork: 'magalu-parceiro' },
  { id: 'mercadolivre', name: 'Mercado Livre', domains: ['mercadolivre.com.br', 'produto.mercadolivre.com.br'] },
  { id: 'americanas', name: 'Americanas', domains: ['americanas.com.br'] },
  { id: 'casasbahia', name: 'Casas Bahia', domains: ['casasbahia.com.br'] },
  { id: 'madeiramadeira', name: 'MadeiraMadeira', domains: ['madeiramadeira.com.br'], affiliateNetwork: 'awin' },
  { id: 'mobly', name: 'Mobly', domains: ['mobly.com.br'] },
  { id: 'centauro', name: 'Centauro', domains: ['centauro.com.br'] },
  { id: 'netshoes', name: 'Netshoes', domains: ['netshoes.com.br'] },
];

const byDomain = new Map<string, Store>();
for (const store of STORES) {
  for (const domain of store.domains) byDomain.set(domain, store);
}

export function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

/** Resolve a loja pelo host, aceitando subdomínios (ex.: loja.kabum.com.br). */
export function findStoreByUrl(rawUrl: string): Store | null {
  let host: string;
  try {
    host = normalizeHost(new URL(rawUrl).hostname);
  } catch {
    return null;
  }
  const exact = byDomain.get(host);
  if (exact) return exact;
  for (const [domain, store] of byDomain) {
    if (host.endsWith(`.${domain}`)) return store;
  }
  return null;
}

export function findStoreById(id: string): Store | null {
  return STORES.find((s) => s.id === id) ?? null;
}
