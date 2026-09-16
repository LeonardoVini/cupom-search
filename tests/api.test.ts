import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';

let server: Server;
let base: string;
let tempDir: string;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'cupom-db-'));
  process.env.COUPON_DB_PATH = join(tempDir, 'db.json');
  ({ server } = await import('../src/api/server.ts'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (typeof address === 'string' || address === null) throw new Error('sem endereço');
  base = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
});

const post = (path: string, body: unknown) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

test('GET /healthz', async () => {
  const res = await fetch(`${base}/healthz`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test('GET /api/stores lista o catálogo', async () => {
  const res = await fetch(`${base}/api/stores`);
  const body = (await res.json()) as { stores: { id: string }[] };
  assert.ok(body.stores.some((store) => store.id === 'pichau'));
});

test('GET / serve a interface', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Cupom Search/);
});

test('GET com path traversal não escapa da pasta web', async () => {
  const res = await fetch(`${base}/..%2F..%2Fpackage.json`);
  assert.equal(res.status, 404);
});

test('POST /api/search exige url', async () => {
  const res = await post('/api/search', {});
  assert.equal(res.status, 400);
});

test('POST /api/search recusa loja desconhecida', async () => {
  const res = await post('/api/search', { url: 'https://exemplo-desconhecido.com/produto' });
  assert.equal(res.status, 422);
});

test('POST /api/search bloqueia endereço interno (SSRF)', async () => {
  const res = await post('/api/search', { url: 'http://127.0.0.1:3000/admin' });
  assert.ok(res.status === 403 || res.status === 422);
});

test('POST /api/coupons valida e grava; feedback é contabilizado', async () => {
  const bad = await post('/api/coupons', { storeId: 'inexistente', code: 'X', type: 'percent', value: 10 });
  assert.equal(bad.status, 400);

  const created = await post('/api/coupons', {
    storeId: 'pichau',
    code: ' meucupom ',
    type: 'percent',
    value: 12,
    description: 'Enviado no teste',
    rules: { minCartValue: 100 },
  });
  assert.equal(created.status, 201);
  const { coupon } = (await created.json()) as { coupon: { id: string; code: string } };
  assert.equal(coupon.code, 'MEUCUPOM');

  const feedback = await post('/api/feedback', { couponId: coupon.id, worked: true });
  assert.equal(feedback.status, 200);
  const stats = (await feedback.json()) as { feedback: { worked: number } };
  assert.equal(stats.feedback.worked, 1);

  const invalid = await post('/api/feedback', { couponId: coupon.id });
  assert.equal(invalid.status, 400);
});

test('método não suportado responde 405', async () => {
  const res = await fetch(`${base}/api/stores`, { method: 'DELETE' });
  assert.equal(res.status, 405);
});
