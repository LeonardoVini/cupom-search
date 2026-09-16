import test from 'node:test';
import assert from 'node:assert/strict';
import { TtlCache } from '../src/core/cache.ts';

test('wrap chama o produtor uma vez e serve do cache depois', async () => {
  const cache = new TtlCache<number>(1000);
  let calls = 0;
  const produce = async () => {
    calls += 1;
    return 42;
  };
  const first = await cache.wrap('k', produce);
  const second = await cache.wrap('k', produce);
  assert.deepEqual([first.value, first.cached], [42, false]);
  assert.deepEqual([second.value, second.cached], [42, true]);
  assert.equal(calls, 1);
});

test('entrada expira depois do TTL', async () => {
  const cache = new TtlCache<string>(10);
  cache.set('k', 'v');
  assert.equal(cache.get('k'), 'v');
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(cache.get('k'), null);
});

test('descarta a entrada menos usada ao atingir o limite', () => {
  const cache = new TtlCache<number>(1000, 2);
  cache.set('a', 1);
  cache.set('b', 2);
  cache.get('a'); // 'a' volta a ser o mais recente
  cache.set('c', 3);
  assert.equal(cache.get('b'), null);
  assert.equal(cache.get('a'), 1);
  assert.equal(cache.get('c'), 3);
});

test('clear esvazia', () => {
  const cache = new TtlCache<number>(1000);
  cache.set('a', 1);
  cache.clear();
  assert.equal(cache.size, 0);
});
