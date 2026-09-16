import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { searchByUrl, couponsForStore, rankForProduct } from '../core/search.ts';
import { FetchError } from '../core/fetcher.ts';
import { STORES, findStoreById, findStoreByUrl } from '../core/stores.ts';
import { buildOutboundUrl } from '../core/affiliateLinks.ts';
import { db } from '../db/store.ts';
import { rateLimit } from './rateLimit.ts';
import type { Coupon, Product, Validation } from '../core/types.ts';

const WEB_DIR = fileURLToPath(new URL('../web/', import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32_000) throw new FetchError('Corpo da requisição grande demais.', 413);
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new FetchError('JSON inválido.', 400);
  }
}

function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}

async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
  const file = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (file.includes('..') || file.includes('/')) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }
  try {
    const content = await readFile(new URL(file, `file://${WEB_DIR}`));
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
  }
}

/** Produto "vazio": usado quando só sabemos a loja (caso do carrinho). */
function bareProduct(storeId: string, storeName: string): Product {
  return {
    url: '',
    storeId,
    storeName,
    title: null,
    price: null,
    currency: 'BRL',
    categories: [],
    sku: null,
    source: 'none',
  };
}

export const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const method = req.method ?? 'GET';

  // A extensão roda dentro da página da loja, então precisa de CORS na API.
  if (url.pathname.startsWith('/api/')) {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'content-type');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    if (method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
  }

  try {
    if (method === 'GET' && url.pathname === '/healthz') return json(res, 200, { ok: true });

    if (method === 'GET' && url.pathname === '/api/stats') {
      return json(res, 200, await db.stats());
    }

    if (method === 'GET' && url.pathname === '/api/stores') {
      return json(res, 200, {
        stores: STORES.map(({ id, name, domains, checkoutCouponField }) => ({
          id,
          name,
          domains,
          checkoutCouponField: checkoutCouponField ?? null,
        })),
      });
    }

    // Usado pela extensão no carrinho: lá não há URL de produto, só a loja.
    if (method === 'GET' && url.pathname === '/api/coupons') {
      const storeId = url.searchParams.get('storeId') ?? '';
      const store = findStoreById(storeId) ?? findStoreByUrl(url.searchParams.get('url') ?? '');
      if (!store) return json(res, 404, { error: 'Loja não catalogada.' });
      const matches = await rankForProduct(await couponsForStore(store), bareProduct(store.id, store.name));
      return json(res, 200, { store: { id: store.id, name: store.name }, matches });
    }

    if (method === 'POST' && url.pathname === '/api/search') {
      const limit = rateLimit(clientIp(req));
      if (!limit.ok) {
        res.setHeader('retry-after', String(limit.retryAfter));
        return json(res, 429, { error: 'Muitas buscas seguidas. Tente de novo em instantes.' });
      }
      const body = await readJsonBody(req);
      const target = typeof body.url === 'string' ? body.url.trim() : '';
      if (!target) return json(res, 400, { error: 'Envie o campo "url" com o link do produto.' });
      return json(res, 200, await searchByUrl(target));
    }

    // Relato manual vindo do site.
    if (method === 'POST' && url.pathname === '/api/feedback') {
      const body = await readJsonBody(req);
      const { storeId, code } = requireStoreAndCode(body);
      if (typeof body.worked !== 'boolean') return json(res, 400, { error: 'Envie "worked" (true/false).' });
      return json(res, 200, { evidence: await db.recordReport(storeId, code, body.worked) });
    }

    // Teste real feito pela extensão dentro do checkout.
    if (method === 'POST' && url.pathname === '/api/validations') {
      const limit = rateLimit(`validate:${clientIp(req)}`, 120);
      if (!limit.ok) return json(res, 429, { error: 'Muitos envios seguidos.' });
      const body = await readJsonBody(req);
      const validation = parseValidation(body);
      return json(res, 201, { evidence: await db.recordValidation(validation) });
    }

    if (method === 'POST' && url.pathname === '/api/coupons') {
      const limit = rateLimit(`submit:${clientIp(req)}`, 10);
      if (!limit.ok) return json(res, 429, { error: 'Muitos envios seguidos.' });
      const body = await readJsonBody(req);
      return json(res, 201, { coupon: await db.upsertCoupon(parseSubmission(body)) });
    }

    // Link de saída: registra o clique e manda para a loja (com afiliado).
    if (method === 'GET' && url.pathname === '/go') {
      const target = url.searchParams.get('url') ?? '';
      const code = url.searchParams.get('code') ?? '';
      const store = findStoreByUrl(target);
      const outbound = buildOutboundUrl(target, code || undefined);
      // Só redireciona para loja catalogada — evita virar open redirect.
      if (!store || !outbound) return json(res, 400, { error: 'Link de saída inválido.' });
      await db.recordClick(store.id, code).catch(() => {});
      res.writeHead(302, { location: outbound, 'cache-control': 'no-store' }).end();
      return;
    }

    if (method === 'GET') return await serveStatic(url.pathname, res);
    return json(res, 405, { error: 'Método não suportado.' });
  } catch (err) {
    if (err instanceof FetchError) return json(res, err.status, { error: err.message });
    console.error('erro inesperado', err);
    return json(res, 500, { error: 'Erro interno.' });
  }
});

function requireStoreAndCode(body: Record<string, unknown>): { storeId: string; code: string } {
  const storeId = typeof body.storeId === 'string' ? body.storeId : '';
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  if (!findStoreById(storeId)) throw new FetchError('storeId desconhecido.');
  if (!code || code.length > 40) throw new FetchError('Código do cupom inválido.');
  return { storeId, code };
}

function parseValidation(body: Record<string, unknown>): Validation {
  const { storeId, code } = requireStoreAndCode(body);
  if (typeof body.worked !== 'boolean') throw new FetchError('Envie "worked" (true/false).');
  const discount = toPositiveNumber(body.discount);
  const cartTotal = toPositiveNumber(body.cartTotal);
  return {
    storeId,
    code,
    worked: body.worked,
    discount,
    cartTotal,
    at: new Date().toISOString(),
    method: body.method === 'manual' ? 'manual' : 'extension',
  };
}

function toPositiveNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 && parsed < 1_000_000 ? parsed : null;
}

function parseSubmission(body: Record<string, unknown>): Coupon {
  const { storeId, code } = requireStoreAndCode(body);
  const type = body.type === 'percent' || body.type === 'fixed' || body.type === 'shipping' ? body.type : null;
  if (!type) throw new FetchError('type deve ser percent, fixed ou shipping.');
  const value = Number(body.value ?? 0);
  if (!Number.isFinite(value) || value < 0 || value > 100_000) throw new FetchError('value inválido.');

  return {
    id: randomUUID(),
    storeId,
    code,
    description:
      typeof body.description === 'string' ? body.description.slice(0, 200) : 'Cupom enviado pela comunidade',
    type,
    value,
    rules: (body.rules && typeof body.rules === 'object' ? body.rules : {}) as Coupon['rules'],
    expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : null,
    lastSeenAt: new Date().toISOString(),
    source: 'community',
  };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  server.listen(PORT, () => console.log(`cupom-search rodando em http://localhost:${PORT}`));
}
