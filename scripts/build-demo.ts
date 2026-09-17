/**
 * Prepara a demonstração para navegador: compila os módulos puros do motor
 * (tipos, lojas, produto, ranking) para JavaScript e copia a lógica da
 * extensão e os dados de seed ao lado.
 *
 * A demo roda o código de verdade — nada é reescrito para a página.
 */
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const OUT = root('docs/demo/engine');

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

execFileSync('npx', ['tsc', '-p', root('tsconfig.demo.json')], { stdio: 'inherit' });

// A heurística da extensão já é JavaScript puro: vai como está.
await copyFile(root('extension/lib.js'), `${OUT}/lib.js`);

// Os cupons de demonstração viram módulo, para a página não precisar de fetch.
const seed = JSON.parse(await readFile(root('data/coupons.seed.json'), 'utf8')) as {
  coupons: Record<string, unknown>[];
};
await writeFile(
  `${OUT}/seed.js`,
  `// Gerado por scripts/build-demo.ts a partir de data/coupons.seed.json.\n` +
    `export const SEED = ${JSON.stringify(seed.coupons, null, 2)};\n`,
);

console.log(`motor compilado em ${OUT}`);
