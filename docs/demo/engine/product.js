import { findStoreByUrl } from "./stores.js";
/** "R$ 1.299,90" | "1299.90" | 1299.9 -> 1299.9 */
export function parsePrice(raw) {
    if (typeof raw === 'number')
        return Number.isFinite(raw) && raw > 0 ? raw : null;
    if (typeof raw !== 'string')
        return null;
    const cleaned = raw.replace(/[^\d.,]/g, '');
    if (!cleaned)
        return null;
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    let normalized;
    if (lastComma > lastDot) {
        // formato pt-BR: 1.299,90
        normalized = cleaned.replace(/\./g, '').replace(',', '.');
    }
    else if (lastDot > -1 && cleaned.length - lastDot - 1 === 3 && lastComma === -1) {
        // 1.299 -> milhar sem centavos
        normalized = cleaned.replace(/\./g, '');
    }
    else {
        normalized = cleaned.replace(/,/g, '');
    }
    const value = Number.parseFloat(normalized);
    return Number.isFinite(value) && value > 0 ? value : null;
}
function decodeEntities(text) {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#3[49];/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .trim();
}
function metaContent(html, ...keys) {
    for (const key of keys) {
        const pattern = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${key}["'][^>]*>`, 'i');
        const tag = html.match(pattern)?.[0];
        const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
        if (content)
            return decodeEntities(content);
    }
    return null;
}
function* jsonLdNodes(html) {
    const blocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    for (const block of blocks) {
        let parsed;
        try {
            parsed = JSON.parse(block[1].trim());
        }
        catch {
            continue;
        }
        const queue = [parsed];
        while (queue.length) {
            const node = queue.shift();
            if (Array.isArray(node))
                queue.push(...node);
            else if (node && typeof node === 'object') {
                const record = node;
                yield record;
                if (Array.isArray(record['@graph']))
                    queue.push(...record['@graph']);
            }
        }
    }
}
function isProductNode(node) {
    const type = node['@type'];
    const types = Array.isArray(type) ? type : [type];
    return types.some((t) => typeof t === 'string' && t.toLowerCase() === 'product');
}
function firstOffer(node) {
    const offers = node.offers;
    if (Array.isArray(offers))
        return offers[0] ?? null;
    if (offers && typeof offers === 'object') {
        const record = offers;
        if (Array.isArray(record.offers))
            return record.offers[0] ?? null;
        return record;
    }
    return null;
}
/** Deriva tags de categoria a partir do texto livre (categoria + título + URL). */
export function deriveCategories(...inputs) {
    const haystack = inputs.filter(Boolean).join(' ').toLowerCase();
    const tags = new Set();
    const dictionary = {
        informatica: ['notebook', 'computador', 'pc gamer', 'monitor', 'teclado', 'mouse', 'headset', 'ssd', 'placa de video', 'processador', 'memoria ram', 'informatica', 'hardware'],
        moveis: ['mesa', 'cadeira', 'escrivaninha', 'estante', 'armario', 'sofa', 'movel', 'moveis', 'rack'],
        escritorio: ['escritorio', 'home office', 'gamer chair', 'cadeira gamer'],
        celulares: ['celular', 'smartphone', 'iphone', 'galaxy', 'motorola', 'xiaomi'],
        eletrodomesticos: ['geladeira', 'fogao', 'microondas', 'lavadora', 'air fryer', 'eletrodomestico'],
        games: ['playstation', 'xbox', 'nintendo', 'console', 'jogo', 'game'],
        esporte: ['tenis', 'academia', 'esporte', 'bicicleta', 'suplemento'],
        moda: ['camiseta', 'calca', 'vestido', 'sapato', 'moda', 'roupa'],
    };
    const normalized = haystack.normalize('NFD').replace(/[̀-ͯ]/g, '');
    for (const [tag, words] of Object.entries(dictionary)) {
        if (words.some((word) => normalized.includes(word)))
            tags.add(tag);
    }
    const stopwords = new Set(['https', 'http', 'www', 'com', 'produto', 'produtos', 'html', 'para', 'index', 'shop', 'loja']);
    for (const segment of haystack.split(/[\s/>|,.-]+/)) {
        const clean = segment.replace(/[^a-zà-ú0-9]/gi, '');
        if (clean.length >= 4 && clean.length <= 20 && !stopwords.has(clean))
            tags.add(clean);
    }
    return [...tags];
}
/** Extrai dados do produto a partir do HTML da página. */
export function extractProduct(url, html) {
    const store = findStoreByUrl(url);
    const base = {
        url,
        storeId: store?.id ?? null,
        storeName: store?.name ?? null,
        title: null,
        price: null,
        currency: 'BRL',
        categories: [],
        sku: null,
        source: 'none',
    };
    for (const node of jsonLdNodes(html)) {
        if (!isProductNode(node))
            continue;
        const offer = firstOffer(node);
        const title = typeof node.name === 'string' ? decodeEntities(node.name) : null;
        const price = parsePrice(offer?.price ?? offer?.lowPrice ?? null);
        const category = typeof node.category === 'string' ? node.category : null;
        const sku = typeof node.sku === 'string' ? node.sku : typeof node.mpn === 'string' ? node.mpn : null;
        if (title || price) {
            return {
                ...base,
                title,
                price,
                currency: typeof offer?.priceCurrency === 'string' ? offer.priceCurrency : 'BRL',
                categories: deriveCategories(category, title, url),
                sku,
                source: 'json-ld',
            };
        }
    }
    const ogTitle = metaContent(html, 'og:title', 'twitter:title');
    const ogPrice = metaContent(html, 'product:price:amount', 'og:price:amount', 'price');
    if (ogTitle || ogPrice) {
        return {
            ...base,
            title: ogTitle,
            price: parsePrice(ogPrice),
            currency: metaContent(html, 'product:price:currency', 'og:price:currency') ?? 'BRL',
            categories: deriveCategories(metaContent(html, 'product:category'), ogTitle, url),
            sku: metaContent(html, 'product:retailer_item_id'),
            source: 'open-graph',
        };
    }
    const htmlTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    const inlinePrice = html.match(/R\$\s*[\d.,]+/i)?.[0];
    const title = htmlTitle ? decodeEntities(htmlTitle) : null;
    return {
        ...base,
        title,
        price: parsePrice(inlinePrice),
        categories: deriveCategories(title, url),
        source: title || inlinePrice ? 'heuristic' : 'none',
    };
}
