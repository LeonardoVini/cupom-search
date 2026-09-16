import type { CouponMatch, FeedbackStats, Product } from './types.ts';
import { findStoreByUrl } from './stores.ts';
import { fetchHtml, FetchError } from './fetcher.ts';
import { extractProduct } from './product.ts';
import { collectCoupons, trustOf } from './providers/index.ts';
import { matchCoupon, rankMatches } from './matching.ts';
import { db } from '../db/store.ts';

export interface SearchResult {
  product: Product;
  matches: CouponMatch[];
  warnings: string[];
}

/** Fluxo completo: link -> produto -> cupons da loja -> ranking explicado. */
export async function searchByUrl(rawUrl: string): Promise<SearchResult> {
  const store = findStoreByUrl(rawUrl);
  const warnings: string[] = [];

  if (!store) {
    throw new FetchError(
      'Ainda não conheço essa loja. Me diga qual é e eu adiciono ao catálogo.',
      422,
    );
  }

  let html = '';
  try {
    html = await fetchHtml(rawUrl);
  } catch (err) {
    if (err instanceof FetchError && err.status >= 500) {
      warnings.push('Não consegui ler a página do produto; mostrando os cupons gerais da loja.');
    } else {
      throw err;
    }
  }

  const product = html
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
        source: 'none' as const,
      };

  if (product.price === null) {
    warnings.push('Não identifiquei o preço na página, então regras de valor mínimo ficam incertas.');
  }

  const coupons = await collectCoupons(store);
  const feedback: Record<string, FeedbackStats> = await db.allFeedback().catch(() => ({}));

  const matches = rankMatches(
    coupons.map((coupon) =>
      matchCoupon(coupon, product, {
        sourceTrust: trustOf(coupon.source),
        feedback: feedback[coupon.id],
      }),
    ),
  );

  if (matches.some((match) => match.coupon.demo)) {
    warnings.push('Esta instalação está usando dados de demonstração: os códigos marcados como "demo" não são cupons reais.');
  }

  return { product, matches, warnings };
}
