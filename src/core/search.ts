import type { Coupon, CouponMatch, Evidence, Product, Store } from './types.ts';
import { evidenceKey } from './types.ts';
import { findStoreByUrl } from './stores.ts';
import { fetchHtml, FetchError } from './fetcher.ts';
import { extractProduct } from './product.ts';
import { collectCoupons, trustOf } from './providers/index.ts';
import { matchCoupon, rankMatches } from './matching.ts';
import { buildOutboundUrl } from './affiliateLinks.ts';
import { productCache, couponCache } from './cache.ts';
import { db } from '../db/store.ts';

export interface SearchResult {
  product: Product;
  matches: CouponMatch[];
  warnings: string[];
  /** Link de saída (com afiliado, quando configurado). */
  outboundUrl: string | null;
  cached: boolean;
}

/** Cupons da loja, com cache curto para não bater nos providers a cada busca. */
export async function couponsForStore(store: Store): Promise<Coupon[]> {
  const { value } = await couponCache.wrap(`coupons:${store.id}`, async () => collectCoupons(store));
  return value as Coupon[];
}

/** Aplica evidência e regras a uma lista de cupons, já ranqueada. */
export async function rankForProduct(coupons: Coupon[], product: Product): Promise<CouponMatch[]> {
  const evidence: Record<string, Evidence> = await db.allEvidence().catch(() => ({}));
  return rankMatches(
    coupons.map((coupon) =>
      matchCoupon(coupon, product, {
        sourceTrust: trustOf(coupon.source),
        evidence: evidence[evidenceKey(coupon.storeId, coupon.code)],
      }),
    ),
  );
}

/** Fluxo completo: link -> produto -> cupons da loja -> ranking explicado. */
export async function searchByUrl(rawUrl: string): Promise<SearchResult> {
  const store = findStoreByUrl(rawUrl);
  const warnings: string[] = [];

  if (!store) {
    throw new FetchError('Ainda não conheço essa loja. Me diga qual é e eu adiciono ao catálogo.', 422);
  }

  let html = '';
  let cached = false;
  try {
    const result = await productCache.wrap(`html:${rawUrl}`, () => fetchHtml(rawUrl));
    html = result.value;
    cached = result.cached;
  } catch (err) {
    if (err instanceof FetchError && err.status >= 500) {
      warnings.push('Não consegui ler a página do produto; mostrando os cupons gerais da loja.');
    } else {
      throw err;
    }
  }

  const product: Product = html
    ? extractProduct(rawUrl, html)
    : {
        url: rawUrl,
        storeId: store.id,
        storeName: store.name,
        title: null,
        price: null,
        currency: 'BRL',
        categories: [],
        sku: null,
        source: 'none',
      };

  if (product.price === null) {
    warnings.push('Não identifiquei o preço na página, então regras de valor mínimo ficam incertas.');
  }

  const matches = await rankForProduct(await couponsForStore(store), product);

  if (matches.some((match) => match.coupon.demo)) {
    warnings.push(
      'Esta instalação está usando dados de demonstração: os códigos marcados como "demo" não são cupons reais.',
    );
  }
  if (!matches.some((match) => match.evidence.checkout.success + match.evidence.checkout.failure > 0)) {
    warnings.push(
      'Nenhum destes códigos foi testado no checkout ainda — instale a extensão para confirmar o desconto de verdade.',
    );
  }

  return { product, matches, warnings, outboundUrl: buildOutboundUrl(rawUrl), cached };
}
