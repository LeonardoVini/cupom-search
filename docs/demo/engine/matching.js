import { emptyEvidence, evidenceKey } from "./types.js";
const DAY_MS = 86_400_000;
/** Formata em Real, para as mensagens saírem legíveis em pt-BR. */
function brl(value) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function normalize(text) {
    return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function matchesAnyCategory(productCategories, ruleCategories) {
    const product = productCategories.map(normalize);
    return ruleCategories.some((rule) => {
        const needle = normalize(rule);
        return product.some((tag) => tag.includes(needle) || needle.includes(tag));
    });
}
/** Desconto estimado em BRL para um carrinho com apenas este produto. */
export function estimateSavings(coupon, price) {
    if (coupon.type === 'shipping')
        return null;
    if (price === null)
        return null;
    const raw = coupon.type === 'percent' ? (price * coupon.value) / 100 : coupon.value;
    const capped = coupon.rules.maxDiscountValue ? Math.min(raw, coupon.rules.maxDiscountValue) : raw;
    return Math.min(Math.round(capped * 100) / 100, price);
}
/**
 * Média a posteriori de uma Beta com prior neutro: um único "funcionou" não
 * vira 100%, e a taxa só se aproxima do extremo com amostra de verdade.
 * (2 observações imaginárias empatadas em 50%.)
 */
export function evidenceScore(success, failure, priorWeight = 2) {
    return (success + 0.5 * priorWeight) / (success + failure + priorWeight);
}
/** Decai de 1 para ~0 conforme o cupom envelhece sem nova confirmação. */
export function freshnessScore(lastSeenAt, now = new Date()) {
    const ageDays = (now.getTime() - new Date(lastSeenAt).getTime()) / DAY_MS;
    if (!Number.isFinite(ageDays))
        return 0.3;
    if (ageDays <= 0)
        return 1;
    return Math.exp(-ageDays / 21);
}
/** Mediana dos descontos observados no checkout. */
export function medianDiscount(samples) {
    if (samples.length === 0)
        return null;
    const sorted = [...samples].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const value = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    return Math.round(value * 100) / 100;
}
/**
 * Cruza um cupom com o produto e devolve aplicabilidade + confiança explicada.
 * Nada aqui "testa" o cupom na loja: é uma estimativa a partir de regras,
 * frescor da fonte e feedback da comunidade.
 */
export function matchCoupon(coupon, product, options = {}) {
    const now = options.now ?? new Date();
    const evidence = options.evidence ?? emptyEvidence(evidenceKey(coupon.storeId, coupon.code));
    const sourceTrust = options.sourceTrust ?? 0.5;
    const reasons = [];
    const blockers = [];
    const rules = coupon.rules;
    const price = product.price;
    /** hard = regra conhecida que impede o uso; soft = ressalva que só reduz a confiança. */
    let hardBlock = false;
    let softPenalty = 1;
    const block = (message, kind, penalty = 0.7) => {
        blockers.push(message);
        if (kind === 'hard')
            hardBlock = true;
        else
            softPenalty *= penalty;
    };
    const expired = coupon.expiresAt !== null && new Date(coupon.expiresAt).getTime() < now.getTime();
    if (expired)
        block('Cupom expirado segundo a fonte.', 'hard');
    else if (coupon.expiresAt) {
        const days = Math.ceil((new Date(coupon.expiresAt).getTime() - now.getTime()) / DAY_MS);
        reasons.push(`Válido por mais ${days} dia${days === 1 ? '' : 's'} segundo a fonte.`);
    }
    if (rules.minCartValue !== undefined) {
        if (price === null) {
            block(`Exige carrinho mínimo de ${brl(rules.minCartValue)} e não li o preço da página.`, 'soft', 0.8);
        }
        else if (price < rules.minCartValue) {
            block(`Carrinho mínimo de ${brl(rules.minCartValue)} — faltam ${brl(rules.minCartValue - price)}.`, 'hard');
        }
        else {
            reasons.push(`Produto atinge o mínimo de ${brl(rules.minCartValue)}.`);
        }
    }
    if (rules.includeCategories?.length) {
        if (matchesAnyCategory(product.categories, rules.includeCategories)) {
            reasons.push(`Categoria compatível (${rules.includeCategories.join(', ')}).`);
        }
        else if (product.categories.length === 0) {
            block(`Restrito a ${rules.includeCategories.join(', ')} e não consegui ler a categoria do produto.`, 'soft', 0.6);
        }
        else {
            block(`Restrito a ${rules.includeCategories.join(', ')} e o produto não parece se encaixar.`, 'hard');
        }
    }
    if (rules.excludeCategories?.length && matchesAnyCategory(product.categories, rules.excludeCategories)) {
        block(`Categoria excluída pelo cupom (${rules.excludeCategories.join(', ')}).`, 'hard');
    }
    if (rules.firstPurchaseOnly)
        block('Só vale na primeira compra na loja.', 'soft');
    if (rules.appOnly)
        block('Só funciona no aplicativo da loja.', 'soft');
    if (rules.newsletterOnly)
        block('Exige cadastro na newsletter.', 'soft');
    if (rules.paymentMethods?.length) {
        reasons.push(`Exige pagamento via ${rules.paymentMethods.join(' ou ')}.`);
    }
    const applicable = !hardBlock;
    // 1. Ponto de partida: quão fresca e quão confiável é a fonte do cupom.
    const freshness = freshnessScore(coupon.lastSeenAt, now);
    let score = 0.40 * freshness + 0.30 * sourceTrust + 0.30 * 0.5;
    // 2. Relatos manuais do site: sinal fraco, peso limitado.
    const reportVotes = evidence.reports.worked + evidence.reports.failed;
    if (reportVotes > 0) {
        const reportWeight = Math.min(0.35, reportVotes * 0.05);
        score = score * (1 - reportWeight) + evidenceScore(evidence.reports.worked, evidence.reports.failed) * reportWeight;
        if (reportVotes >= 3) {
            reasons.push(`${evidence.reports.worked} de ${reportVotes} pessoas relataram que funcionou.`);
        }
    }
    // 3. Teste real no checkout (extensão): domina os demais sinais, mas decai
    //    com o tempo — cupom testado há dois meses não diz muito sobre hoje.
    const attempts = evidence.checkout.success + evidence.checkout.failure;
    if (attempts > 0) {
        const recency = evidence.lastAttemptAt ? freshnessScore(evidence.lastAttemptAt, now) : 0.2;
        const checkoutWeight = Math.min(0.85, 0.35 + attempts * 0.12) * recency;
        score = score * (1 - checkoutWeight) + evidenceScore(evidence.checkout.success, evidence.checkout.failure) * checkoutWeight;
        const when = evidence.lastSuccessAt ?? evidence.lastAttemptAt;
        if (evidence.checkout.success > 0 && when) {
            const daysAgo = Math.max(0, Math.round((now.getTime() - new Date(when).getTime()) / DAY_MS));
            reasons.push(`Aplicado com sucesso no checkout ${evidence.checkout.success}x (último há ${daysAgo === 0 ? 'menos de um dia' : `${daysAgo} dia${daysAgo === 1 ? '' : 's'}`}).`);
        }
        else {
            blockers.push(`Testado no checkout ${attempts}x e falhou todas as vezes.`);
        }
    }
    let confidence = (applicable ? score : score * 0.15) * softPenalty;
    // Três tentativas reais no carrinho sem nenhum sucesso: o código não vale.
    if (evidence.checkout.failure >= 3 && evidence.checkout.success === 0) {
        confidence = Math.min(confidence, 0.08);
    }
    if (expired)
        confidence = 0;
    confidence = Math.max(0, Math.min(1, Math.round(confidence * 100) / 100));
    const observedDiscount = medianDiscount(evidence.discountSamples);
    if (observedDiscount !== null) {
        reasons.push(`Desconto observado no carrinho: ${brl(observedDiscount)}.`);
    }
    if (freshness > 0.7)
        reasons.push('Confirmado pela fonte nos últimos dias.');
    else if (freshness < 0.25)
        blockers.push('A fonte não confirma esse cupom há semanas.');
    const estimatedSavings = applicable ? estimateSavings(coupon, price) : null;
    const finalPrice = estimatedSavings !== null && price !== null ? Math.round((price - estimatedSavings) * 100) / 100 : null;
    return {
        coupon,
        applicable,
        confidence,
        estimatedSavings,
        finalPrice,
        reasons,
        blockers,
        observedDiscount,
        evidence,
    };
}
/** Ordena por aplicabilidade, depois economia estimada, depois confiança. */
export function rankMatches(matches) {
    return [...matches].sort((a, b) => {
        if (a.applicable !== b.applicable)
            return a.applicable ? -1 : 1;
        const savingsDiff = (b.estimatedSavings ?? 0) - (a.estimatedSavings ?? 0);
        if (Math.abs(savingsDiff) > 0.01)
            return savingsDiff;
        return b.confidence - a.confidence;
    });
}
