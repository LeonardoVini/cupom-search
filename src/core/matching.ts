import type { Coupon, CouponMatch, FeedbackStats, Product } from './types.ts';

const DAY_MS = 86_400_000;

export const EMPTY_FEEDBACK: FeedbackStats = { worked: 0, failed: 0, lastWorkedAt: null };

/** Formata em Real, para as mensagens saírem legíveis em pt-BR. */
function brl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function matchesAnyCategory(productCategories: string[], ruleCategories: string[]): boolean {
  const product = productCategories.map(normalize);
  return ruleCategories.some((rule) => {
    const needle = normalize(rule);
    return product.some((tag) => tag.includes(needle) || needle.includes(tag));
  });
}

/** Desconto estimado em BRL para um carrinho com apenas este produto. */
export function estimateSavings(coupon: Coupon, price: number | null): number | null {
  if (coupon.type === 'shipping') return null;
  if (price === null) return null;
  const raw = coupon.type === 'percent' ? (price * coupon.value) / 100 : coupon.value;
  const capped = coupon.rules.maxDiscountValue ? Math.min(raw, coupon.rules.maxDiscountValue) : raw;
  return Math.min(Math.round(capped * 100) / 100, price);
}

/**
 * Limite inferior do intervalo de Wilson (95%) para a taxa de sucesso relatada.
 * Penaliza cupons com poucos votos em vez de tratá-los como 100%.
 */
export function wilsonLowerBound(worked: number, failed: number): number {
  const total = worked + failed;
  if (total === 0) return 0.5;
  const z = 1.96;
  const phat = worked / total;
  const denominator = 1 + (z * z) / total;
  const centre = phat + (z * z) / (2 * total);
  const margin = z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * total)) / total);
  return Math.max(0, (centre - margin) / denominator);
}

/** Decai de 1 para ~0 conforme o cupom envelhece sem nova confirmação. */
export function freshnessScore(lastSeenAt: string, now = new Date()): number {
  const ageDays = (now.getTime() - new Date(lastSeenAt).getTime()) / DAY_MS;
  if (!Number.isFinite(ageDays)) return 0.3;
  if (ageDays <= 0) return 1;
  return Math.exp(-ageDays / 21);
}

export interface MatchOptions {
  now?: Date;
  /** Peso de confiança da fonte (0..1). */
  sourceTrust?: number;
  feedback?: FeedbackStats;
}

/**
 * Cruza um cupom com o produto e devolve aplicabilidade + confiança explicada.
 * Nada aqui "testa" o cupom na loja: é uma estimativa a partir de regras,
 * frescor da fonte e feedback da comunidade.
 */
export function matchCoupon(coupon: Coupon, product: Product, options: MatchOptions = {}): CouponMatch {
  const now = options.now ?? new Date();
  const feedback = options.feedback ?? EMPTY_FEEDBACK;
  const sourceTrust = options.sourceTrust ?? 0.5;
  const reasons: string[] = [];
  const blockers: string[] = [];
  const rules = coupon.rules;
  const price = product.price;

  /** hard = regra conhecida que impede o uso; soft = ressalva que só reduz a confiança. */
  let hardBlock = false;
  let softPenalty = 1;
  const block = (message: string, kind: 'hard' | 'soft', penalty = 0.7): void => {
    blockers.push(message);
    if (kind === 'hard') hardBlock = true;
    else softPenalty *= penalty;
  };

  const expired = coupon.expiresAt !== null && new Date(coupon.expiresAt).getTime() < now.getTime();
  if (expired) block('Cupom expirado segundo a fonte.', 'hard');
  else if (coupon.expiresAt) {
    const days = Math.ceil((new Date(coupon.expiresAt).getTime() - now.getTime()) / DAY_MS);
    reasons.push(`Válido por mais ${days} dia${days === 1 ? '' : 's'} segundo a fonte.`);
  }

  if (rules.minCartValue !== undefined) {
    if (price === null) {
      block(
        `Exige carrinho mínimo de ${brl(rules.minCartValue)} e não li o preço da página.`,
        'soft',
        0.8,
      );
    } else if (price < rules.minCartValue) {
      block(
        `Carrinho mínimo de ${brl(rules.minCartValue)} — faltam ${brl(rules.minCartValue - price)}.`,
        'hard',
      );
    } else {
      reasons.push(`Produto atinge o mínimo de ${brl(rules.minCartValue)}.`);
    }
  }

  if (rules.includeCategories?.length) {
    if (matchesAnyCategory(product.categories, rules.includeCategories)) {
      reasons.push(`Categoria compatível (${rules.includeCategories.join(', ')}).`);
    } else if (product.categories.length === 0) {
      block(`Restrito a ${rules.includeCategories.join(', ')} e não consegui ler a categoria do produto.`, 'soft', 0.6);
    } else {
      block(`Restrito a ${rules.includeCategories.join(', ')} e o produto não parece se encaixar.`, 'hard');
    }
  }

  if (rules.excludeCategories?.length && matchesAnyCategory(product.categories, rules.excludeCategories)) {
    block(`Categoria excluída pelo cupom (${rules.excludeCategories.join(', ')}).`, 'hard');
  }

  if (rules.firstPurchaseOnly) block('Só vale na primeira compra na loja.', 'soft');
  if (rules.appOnly) block('Só funciona no aplicativo da loja.', 'soft');
  if (rules.newsletterOnly) block('Exige cadastro na newsletter.', 'soft');
  if (rules.paymentMethods?.length) {
    reasons.push(`Exige pagamento via ${rules.paymentMethods.join(' ou ')}.`);
  }

  const applicable = !hardBlock;

  const freshness = freshnessScore(coupon.lastSeenAt, now);
  const community = wilsonLowerBound(feedback.worked, feedback.failed);
  const votes = feedback.worked + feedback.failed;
  const communityWeight = Math.min(0.45, votes * 0.05);
  const base =
    (0.40 * freshness + 0.30 * sourceTrust + 0.30 * 0.5) * (1 - communityWeight) +
    community * communityWeight;

  let confidence = (applicable ? base : base * 0.15) * softPenalty;
  if (expired) confidence = 0;
  confidence = Math.max(0, Math.min(1, Math.round(confidence * 100) / 100));

  if (votes >= 3) {
    reasons.push(`${feedback.worked} de ${votes} pessoas relataram que funcionou.`);
  }
  if (freshness > 0.7) reasons.push('Confirmado pela fonte nos últimos dias.');
  else if (freshness < 0.25) blockers.push('A fonte não confirma esse cupom há semanas.');


  const estimatedSavings = applicable ? estimateSavings(coupon, price) : null;
  const finalPrice =
    estimatedSavings !== null && price !== null ? Math.round((price - estimatedSavings) * 100) / 100 : null;

  return { coupon, applicable, confidence, estimatedSavings, finalPrice, reasons, blockers, feedback };
}

/** Ordena por aplicabilidade, depois economia estimada, depois confiança. */
export function rankMatches(matches: CouponMatch[]): CouponMatch[] {
  return [...matches].sort((a, b) => {
    if (a.applicable !== b.applicable) return a.applicable ? -1 : 1;
    const savingsDiff = (b.estimatedSavings ?? 0) - (a.estimatedSavings ?? 0);
    if (Math.abs(savingsDiff) > 0.01) return savingsDiff;
    return b.confidence - a.confidence;
  });
}
