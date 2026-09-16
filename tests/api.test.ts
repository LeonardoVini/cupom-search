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

test('POST /api/coupons valida e grava o envio da comunidade', async () => {
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
});

test('relato manual é contabilizado por loja + código', async () => {
  const res = await post('/api/feedback', { storeId: 'pichau', code: 'RELATO1', worked: true });
  assert.equal(res.status, 200);
  const { evidence } = (await res.json()) as { evidence: { reports: { worked: number } } };
  assert.equal(evidence.reports.worked, 1);

  const semWorked = await post('/api/feedback', { storeId: 'pichau', code: 'RELATO1' });
  assert.equal(semWorked.status, 400);
  const semLoja = await post('/api/feedback', { storeId: 'nao-existe', code: 'RELATO1', worked: true });
  assert.equal(semLoja.status, 400);
});

test('validação da extensão registra sucesso e desconto observado', async () => {
  const res = await post('/api/validations', {
    storeId: 'pichau',
    code: 'testado10',
    worked: true,
    discount: 129.99,
    cartTotal: 1169.91,
    method: 'extension',
  });
  assert.equal(res.status, 201);
  const { evidence } = (await res.json()) as {
    evidence: { key: string; checkout: { success: number }; discountSamples: number[] };
  };
  assert.equal(evidence.key, 'pichau:TESTADO10');
  assert.equal(evidence.checkout.success, 1);
  assert.deepEqual(evidence.discountSamples, [129.99]);
});

test('validação com falha não registra desconto', async () => {
  const res = await post('/api/validations', { storeId: 'pichau', code: 'NAOFUNCIONA', worked: false, discount: 0 });
  const { evidence } = (await res.json()) as {
    evidence: { checkout: { failure: number }; discountSamples: number[] };
  };
  assert.equal(evidence.checkout.failure, 1);
  assert.deepEqual(evidence.discountSamples, []);
});

test('validação valida o corpo', async () => {
  assert.equal((await post('/api/validations', { storeId: 'pichau', code: 'X' })).status, 400);
  assert.equal((await post('/api/validations', { storeId: 'x', code: 'X', worked: true })).status, 400);
});

test('GET /api/coupons devolve o ranking da loja sem precisar de produto', async () => {
  const res = await fetch(`${base}/api/coupons?storeId=pichau`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { store: { id: string }; matches: { coupon: { code: string } }[] };
  assert.equal(body.store.id, 'pichau');
  assert.ok(body.matches.length > 0);

  assert.equal((await fetch(`${base}/api/coupons?storeId=nada`)).status, 404);
});

test('a evidência da extensão aparece no ranking da loja', async () => {
  await post('/api/validations', { storeId: 'kabum', code: 'DEMO-KB7', worked: true, discount: 40 });
  await post('/api/validations', { storeId: 'kabum', code: 'DEMO-KB7', worked: true, discount: 42 });
  const res = await fetch(`${base}/api/coupons?storeId=kabum`);
  const { matches } = (await res.json()) as {
    matches: { coupon: { code: string }; observedDiscount: number | null; reasons: string[] }[];
  };
  const match = matches.find((candidate) => candidate.coupon.code === 'DEMO-KB7');
  assert.ok(match);
  assert.equal(match.observedDiscount, 41);
  assert.match(match.reasons.join(' '), /Aplicado com sucesso no checkout/);
});

test('API responde ao preflight de CORS (a extensão depende disso)', async () => {
  const res = await fetch(`${base}/api/stores`, { method: 'OPTIONS' });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
});

test('/go redireciona para a loja e recusa domínio de fora', async () => {
  const res = await fetch(`${base}/go?url=${encodeURIComponent('https://www.pichau.com.br/mesa')}&code=ABC`, {
    redirect: 'manual',
  });
  assert.equal(res.status, 302);
  const location = res.headers.get('location') ?? '';
  assert.match(location, /pichau\.com\.br/);
  assert.match(location, /utm_campaign=ABC/);

  const foreign = await fetch(`${base}/go?url=${encodeURIComponent('https://evil.example.com/')}`, {
    redirect: 'manual',
  });
  assert.equal(foreign.status, 400);
});

test('GET /api/stats resume o que o sistema já aprendeu', async () => {
  const stats = (await (await fetch(`${base}/api/stats`)).json()) as { validations: number; clicks: number };
  assert.ok(stats.validations >= 1);
  assert.ok(stats.clicks >= 1);
});

test('método não suportado responde 405', async () => {
  const res = await fetch(`${base}/api/stores`, { method: 'DELETE' });
  assert.equal(res.status, 405);
});
