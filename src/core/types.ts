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

/**
 * Tudo que sabemos sobre um código a partir do mundo real, agregado por
 * `storeId:CODIGO` (e não pelo id do cupom, que muda conforme a fonte).
 *
 * `reports` são relatos manuais no site; `checkout` são testes feitos pela
 * extensão dentro do carrinho real do usuário — evidência bem mais forte.
 */
export interface Evidence {
  key: string;
  reports: { worked: number; failed: number };
  checkout: { success: number; failure: number };
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  /** Descontos em BRL observados no checkout (amostra recente). */
  discountSamples: number[];
}

export function evidenceKey(storeId: string, code: string): string {
  return `${storeId}:${code.trim().toUpperCase()}`;
}

export function emptyEvidence(key: string): Evidence {
  return {
    key,
    reports: { worked: 0, failed: 0 },
    checkout: { success: 0, failure: 0 },
    lastSuccessAt: null,
    lastAttemptAt: null,
    discountSamples: [],
  };
}

/** Registro bruto de um teste de cupom no checkout. */
export interface Validation {
  storeId: string;
  code: string;
  worked: boolean;
  /** Desconto em BRL lido do carrinho, quando a loja informou. */
  discount: number | null;
  cartTotal: number | null;
  at: string;
  method: 'extension' | 'manual';
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
  /** Desconto mediano realmente observado no checkout, quando houver. */
  observedDiscount: number | null;
  evidence: Evidence;
}

export interface CouponProvider {
  id: string;
  /** Peso de confiança da fonte, 0..1. */
  trust: number;
  /** Retorna cupons conhecidos para a loja. Deve falhar em silêncio. */
  fetch(store: Store): Promise<Coupon[]>;
}
