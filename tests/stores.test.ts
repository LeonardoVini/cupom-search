import test from 'node:test';
import assert from 'node:assert/strict';
import { findStoreByUrl, findStoreById } from '../src/core/stores.ts';

test('identifica a loja pelo domínio, com ou sem www', () => {
  assert.equal(findStoreByUrl('https://www.pichau.com.br/mesa')?.id, 'pichau');
  assert.equal(findStoreByUrl('https://pichau.com.br/mesa')?.id, 'pichau');
  assert.equal(findStoreByUrl('https://loja.kabum.com.br/x')?.id, 'kabum');
});

test('retorna null para loja desconhecida ou URL inválida', () => {
  assert.equal(findStoreByUrl('https://exemplo-desconhecido.com/x'), null);
  assert.equal(findStoreByUrl('nao-e-url'), null);
});

test('não confunde domínio que apenas termina parecido', () => {
  assert.equal(findStoreByUrl('https://naoepichau.com.br/x'), null);
});

test('findStoreById', () => {
  assert.equal(findStoreById('magalu')?.name, 'Magazine Luiza');
  assert.equal(findStoreById('inexistente'), null);
});
