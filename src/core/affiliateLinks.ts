import type { Store } from './types.ts';
import { findStoreByUrl } from './stores.ts';

/**
 * Monta o link de saída para a loja. É por aqui que o negócio ganha dinheiro:
 * a comissão de afiliado vem do clique rastreado, não de assinatura.
 *
 * Configuração por loja via env, ex.:
 *   AFFILIATE_PICHAU=awin:12345      -> deeplink da Awin
 *   AFFILIATE_AMAZON_BR=tag:meucodigo-20
 * Sem configuração, devolve a URL original com UTM — o app continua útil.
 */
export function buildOutboundUrl(rawUrl: string, code?: string): string | null {
  const store = findStoreByUrl(rawUrl);
  if (!store) return null;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  url.searchParams.set('utm_source', 'cupom-search');
  url.searchParams.set('utm_medium', 'referral');
  if (code) url.searchParams.set('utm_campaign', code.toUpperCase());

  const config = affiliateConfigFor(store);
  if (!config) return url.toString();

  const [kind, value] = config;
  if (kind === 'awin') {
    return `https://www.awin1.com/cread.php?awinmid=${encodeURIComponent(value)}&awinaffid=${encodeURIComponent(
      process.env.AWIN_PUBLISHER_ID ?? '',
    )}&ued=${encodeURIComponent(url.toString())}`;
  }
  if (kind === 'tag') {
    url.searchParams.set('tag', value);
    return url.toString();
  }
  if (kind === 'deeplink') {
    return value.replace('{url}', encodeURIComponent(url.toString()));
  }
  return url.toString();
}

function affiliateConfigFor(store: Store): [string, string] | null {
  const raw = process.env[`AFFILIATE_${store.id.toUpperCase().replace(/-/g, '_')}`];
  if (!raw) return null;
  const separator = raw.indexOf(':');
  if (separator < 0) return null;
  return [raw.slice(0, separator), raw.slice(separator + 1)];
}
