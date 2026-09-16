import type { Coupon, CouponProvider, Store } from '../types.ts';

/**
 * Feed oficial de cupons das redes de afiliados (Awin, Lomadee, Rakuten,
 * Admitad). É a fonte legítima e mais confiável: a própria loja publica os
 * códigos, com validade e regras, e você ainda ganha comissão na venda.
 *
 * Sem credencial configurada o provider devolve lista vazia — o app funciona
 * igual, só com menos cupons. Configure:
 *   AWIN_API_TOKEN=...   AWIN_PUBLISHER_ID=...
 */
export const affiliateProvider: CouponProvider = {
  id: 'affiliate-awin',
  trust: 0.9,
  async fetch(store: Store): Promise<Coupon[]> {
    const token = process.env.AWIN_API_TOKEN;
    const publisherId = process.env.AWIN_PUBLISHER_ID;
    if (!token || !publisherId || store.affiliateNetwork !== 'awin') return [];

    try {
      const res = await fetch(
        `https://api.awin.com/publishers/${publisherId}/promotions/`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) },
      );
      if (!res.ok) return [];
      const payload = (await res.json()) as { data?: AwinPromotion[] };
      return (payload.data ?? [])
        .filter((promo) => promo.type === 'voucher' && promo.voucher?.code)
        .map((promo) => toCoupon(promo, store.id));
    } catch {
      return [];
    }
  },
};

interface AwinPromotion {
  promotionId: number;
  type: string;
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  voucher?: { code?: string };
}

function toCoupon(promo: AwinPromotion, storeId: string): Coupon {
  const text = `${promo.title ?? ''} ${promo.description ?? ''}`;
  const percent = text.match(/(\d{1,2})\s*%/);
  const fixed = text.match(/R\$\s*(\d+)/i);
  return {
    id: `awin-${promo.promotionId}`,
    storeId,
    code: promo.voucher?.code ?? '',
    description: promo.title ?? 'Cupom da loja',
    type: percent ? 'percent' : fixed ? 'fixed' : 'shipping',
    value: percent ? Number(percent[1]) : fixed ? Number(fixed[1]) : 0,
    rules: {},
    expiresAt: promo.endDate ?? null,
    lastSeenAt: new Date().toISOString(),
    source: 'affiliate-awin',
  };
}
