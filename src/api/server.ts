import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { searchByUrl } from '../core/search.ts';
import { FetchError } from '../core/fetcher.ts';
import { STORES } from '../core/stores.ts';
import { db } from '../db/store.ts';
import { rateLimit } from './rateLimit.ts';
import type { Coupon } from '../core/types.ts';

const WEB_DIR = fileURLToPath(new URL('../web/', import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function json(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(payload);
}

async function readJsonBody(req: import('node:http').IncomingMessage): Promise<Record<string, unknown>> {
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

function clientIp(req: import('node:http').IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}

async function serveStatic(pathname: string, res: import('node:http').ServerResponse): Promise<void> {
  const file = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (file.includes('..') || file.includes('/')) {
    res.writeHead(404).end('Not found');
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

export const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const method = req.method ?? 'GET';

  try {
    if (method === 'GET' && url.pathname === '/healthz') return json(res, 200, { ok: true });
    if (method === 'GET' && url.pathname === '/api/stores') {
      return json(res, 200, { stores: STORES.map(({ id, name, domains }) => ({ id, name, domains })) });
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
      const result = await searchByUrl(target);
      return json(res, 200, result);
    }

    if (method === 'POST' && url.pathname === '/api/feedback') {
      const body = await readJsonBody(req);
      const couponId = typeof body.couponId === 'string' ? body.couponId : '';
      if (!couponId || typeof body.worked !== 'boolean') {
        return json(res, 400, { error: 'Envie "couponId" e "worked" (true/false).' });
      }
      const stats = await db.recordFeedback(couponId, body.worked);
      return json(res, 200, { couponId, feedback: stats });
    }

    if (method === 'POST' && url.pathname === '/api/coupons') {
      const limit = rateLimit(`submit:${clientIp(req)}`, 10);
      if (!limit.ok) return json(res, 429, { error: 'Muitos envios seguidos.' });
      const body = await readJsonBody(req);
      const coupon = parseSubmission(body);
      const saved = await db.upsertCoupon(coupon);
      return json(res, 201, { coupon: saved });
    }

    if (method === 'GET') return await serveStatic(url.pathname, res);
    return json(res, 405, { error: 'Método não suportado.' });
  } catch (err) {
    if (err instanceof FetchError) return json(res, err.status, { error: err.message });
    console.error('erro inesperado', err);
    return json(res, 500, { error: 'Erro interno.' });
  }
});

function parseSubmission(body: Record<string, unknown>): Coupon {
  const storeId = typeof body.storeId === 'string' ? body.storeId : '';
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  const type = body.type === 'percent' || body.type === 'fixed' || body.type === 'shipping' ? body.type : null;
  if (!storeId || !STORES.some((store) => store.id === storeId)) throw new FetchError('storeId desconhecido.');
  if (!code || code.length > 40) throw new FetchError('Código do cupom inválido.');
  if (!type) throw new FetchError('type deve ser percent, fixed ou shipping.');
  const value = Number(body.value ?? 0);
  if (!Number.isFinite(value) || value < 0 || value > 100_000) throw new FetchError('value inválido.');

  return {
    id: randomUUID(),
    storeId,
    code,
    description: typeof body.description === 'string' ? body.description.slice(0, 200) : 'Cupom enviado pela comunidade',
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
