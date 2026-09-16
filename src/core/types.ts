/** Tipos centrais do domínio. */

export interface Store {
  id: string;
  name: string;
  /** Domínios (sem www) que identificam a loja. */
  domains: string[];
  /** Rede de afiliados que publica cupons oficiais desta loja. */
  affiliateNetwork?: string;
  /** Seletor do campo de cupom no checkout — usado pela futura extensão. */
  checkoutCouponField?: string;
}

export type ProductSource = 'json-ld' | 'open-graph' | 'heuristic' | 'none';

export interface Product {
  url: string;
  storeId: string | null;
  storeName: string | null;
  title: string | null;
  price: number | null;
  currency: string;
  categories: string[];
  sku: string | null;
  source: ProductSource;
}

export type DiscountType = 'percent' | 'fixed' | 'shipping';

export interface CouponRules {
  /** Valor mínimo do carrinho em BRL. */
  minCartValue?: number;
  /** Teto do desconto em BRL (comum em cupons percentuais). */
  maxDiscountValue?: number;
  /** Só vale para estas categorias (match por substring, case-insensitive). */
  includeCategories?: string[];
  /** Nunca vale para estas categorias. */
  excludeCategories?: string[];
  firstPurchaseOnly?: boolean;
  /** 'pix' | 'boleto' | 'credito' | ... */
  paymentMethods?: string[];
  appOnly?: boolean;
  newsletterOnly?: boolean;
}

export interface Coupon {
  id: string;
  storeId: string;
  code: string;
  description: string;
  type: DiscountType;
  /** 10 => 10% (percent) ou R$ 10 (fixed). Ignorado em 'shipping'. */
  value: number;
  rules: CouponRules;
  /** ISO date ou null quando a fonte não informa validade. */
  expiresAt: string | null;
  /** Última vez que a fonte confirmou o cupom. */
  lastSeenAt: string;
  /** Id do provider que trouxe o cupom. */
  source: string;
  sourceUrl?: string;
  /** true = dado de demonstração, não é um cupom real. */
  demo?: boolean;
}

export interface FeedbackStats {
  worked: number;
  failed: number;
  lastWorkedAt: string | null;
}

export interface CouponMatch {
  coupon: Coupon;
  /** Nenhuma regra conhecida impede o uso neste produto. */
  applicable: boolean;
  /** 0..1 — probabilidade estimada de o cupom funcionar hoje. */
  confidence: number;
  estimatedSavings: number | null;
  finalPrice: number | null;
  /** Motivos legíveis que sustentam a recomendação. */
  reasons: string[];
  /** Motivos que impedem ou colocam o cupom em dúvida. */
  blockers: string[];
  feedback: FeedbackStats;
}

export interface CouponProvider {
  id: string;
  /** Peso de confiança da fonte, 0..1. */
  trust: number;
  /** Retorna cupons conhecidos para a loja. Deve falhar em silêncio. */
  fetch(store: Store): Promise<Coupon[]>;
}
