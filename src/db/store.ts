import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Coupon, Evidence, Validation } from '../core/types.ts';
import { emptyEvidence, evidenceKey } from '../core/types.ts';

const DEFAULT_PATH =
  process.env.COUPON_DB_PATH ?? fileURLToPath(new URL('../../data/db.json', import.meta.url));

/** Quantos descontos observados guardamos por código (mediana usa a amostra). */
const MAX_SAMPLES = 25;
/** Registros brutos mantidos para auditoria antes de descartar os mais antigos. */
const MAX_VALIDATIONS = 5_000;

interface DbShape {
  coupons: Coupon[];
  evidence: Record<string, Evidence>;
  validations: Validation[];
  clicks: Record<string, number>;
}

const empty = (): DbShape => ({ coupons: [], evidence: {}, validations: [], clicks: {} });

/**
 * Persistência em arquivo JSON — suficiente para o MVP e trocável por Postgres
 * sem tocar no resto do código (a interface é esta classe).
 */
export class Db {
  #path: string;
  #data: DbShape | null = null;
  #writing: Promise<void> = Promise.resolve();

  constructor(path: string = DEFAULT_PATH) {
    this.#path = path;
  }

  async #load(): Promise<DbShape> {
    if (this.#data) return this.#data;
    try {
      const parsed = JSON.parse(await readFile(this.#path, 'utf8')) as Partial<DbShape>;
      this.#data = { ...empty(), ...parsed };
    } catch {
      this.#data = empty();
    }
    return this.#data;
  }

  /** Grava serializando as escritas para não corromper o arquivo. */
  async #flush(): Promise<void> {
    const data = this.#data ?? empty();
    this.#writing = this.#writing.then(async () => {
      await mkdir(dirname(this.#path), { recursive: true });
      const tmp = `${this.#path}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(data, null, 2));
      await rename(tmp, this.#path);
    });
    return this.#writing;
  }

  async couponsByStore(storeId: string): Promise<Coupon[]> {
    const data = await this.#load();
    return data.coupons.filter((coupon) => coupon.storeId === storeId);
  }

  async upsertCoupon(coupon: Coupon): Promise<Coupon> {
    const data = await this.#load();
    const index = data.coupons.findIndex(
      (existing) => existing.storeId === coupon.storeId && existing.code === coupon.code,
    );
    if (index >= 0) data.coupons[index] = { ...data.coupons[index], ...coupon, id: data.coupons[index].id };
    else data.coupons.push(coupon);
    await this.#flush();
    return index >= 0 ? data.coupons[index] : coupon;
  }

  async evidenceFor(storeId: string, code: string): Promise<Evidence> {
    const key = evidenceKey(storeId, code);
    const data = await this.#load();
    return data.evidence[key] ?? emptyEvidence(key);
  }

  async allEvidence(): Promise<Record<string, Evidence>> {
    return { ...(await this.#load()).evidence };
  }

  async #mutateEvidence(storeId: string, code: string, mutate: (evidence: Evidence) => void): Promise<Evidence> {
    const key = evidenceKey(storeId, code);
    const data = await this.#load();
    const evidence = data.evidence[key] ?? emptyEvidence(key);
    mutate(evidence);
    data.evidence[key] = evidence;
    await this.#flush();
    return evidence;
  }

  /** Relato manual do site ("funcionou / não funcionou"). */
  async recordReport(storeId: string, code: string, worked: boolean): Promise<Evidence> {
    const now = new Date().toISOString();
    return this.#mutateEvidence(storeId, code, (evidence) => {
      if (worked) {
        evidence.reports.worked += 1;
        evidence.lastSuccessAt = now;
      } else {
        evidence.reports.failed += 1;
      }
      evidence.lastAttemptAt = now;
    });
  }

  /**
   * Teste real no checkout, enviado pela extensão. É a evidência mais forte que
   * o sistema tem: o código foi aplicado no carrinho de verdade.
   */
  async recordValidation(validation: Validation): Promise<Evidence> {
    const data = await this.#load();
    data.validations.push(validation);
    if (data.validations.length > MAX_VALIDATIONS) {
      data.validations.splice(0, data.validations.length - MAX_VALIDATIONS);
    }
    return this.#mutateEvidence(validation.storeId, validation.code, (evidence) => {
      if (validation.worked) {
        evidence.checkout.success += 1;
        evidence.lastSuccessAt = validation.at;
        if (validation.discount !== null && validation.discount > 0) {
          evidence.discountSamples.push(validation.discount);
          if (evidence.discountSamples.length > MAX_SAMPLES) evidence.discountSamples.shift();
        }
      } else {
        evidence.checkout.failure += 1;
      }
      evidence.lastAttemptAt = validation.at;
    });
  }

  /** Cliques no link de saída — a métrica que antecede a comissão de afiliado. */
  async recordClick(storeId: string, code: string): Promise<void> {
    const data = await this.#load();
    const key = evidenceKey(storeId, code || '-');
    data.clicks[key] = (data.clicks[key] ?? 0) + 1;
    await this.#flush();
  }

  async stats(): Promise<{ coupons: number; codesWithEvidence: number; validations: number; clicks: number }> {
    const data = await this.#load();
    return {
      coupons: data.coupons.length,
      codesWithEvidence: Object.keys(data.evidence).length,
      validations: data.validations.length,
      clicks: Object.values(data.clicks).reduce((total, value) => total + value, 0),
    };
  }
}

export const db = new Db();
