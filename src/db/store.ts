import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Coupon, FeedbackStats } from '../core/types.ts';

const DEFAULT_PATH =
  process.env.COUPON_DB_PATH ?? fileURLToPath(new URL('../../data/db.json', import.meta.url));

interface DbShape {
  coupons: Coupon[];
  feedback: Record<string, FeedbackStats>;
}

const empty = (): DbShape => ({ coupons: [], feedback: {} });

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
      this.#data = { coupons: parsed.coupons ?? [], feedback: parsed.feedback ?? {} };
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

  async feedbackFor(couponId: string): Promise<FeedbackStats> {
    const data = await this.#load();
    return data.feedback[couponId] ?? { worked: 0, failed: 0, lastWorkedAt: null };
  }

  async allFeedback(): Promise<Record<string, FeedbackStats>> {
    return { ...(await this.#load()).feedback };
  }

  /** Registra "funcionou / não funcionou" — é isso que valida cupom de verdade. */
  async recordFeedback(couponId: string, worked: boolean): Promise<FeedbackStats> {
    const data = await this.#load();
    const current = data.feedback[couponId] ?? { worked: 0, failed: 0, lastWorkedAt: null };
    const updated: FeedbackStats = {
      worked: current.worked + (worked ? 1 : 0),
      failed: current.failed + (worked ? 0 : 1),
      lastWorkedAt: worked ? new Date().toISOString() : current.lastWorkedAt,
    };
    data.feedback[couponId] = updated;
    await this.#flush();
    return updated;
  }
}

export const db = new Db();
