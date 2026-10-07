import { mkdirSync } from 'node:fs';
import { SCHEMA } from './schema';

export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  exec(text: string): Promise<void>;
  close(): Promise<void>;
}

async function connect(): Promise<Db> {
  if (process.env.DATABASE_URL) {
    // Node tries each resolved address (IPv6 and IPv4) with a 250 ms per-attempt
    // timeout. On networks without IPv6 and with >250 ms latency to the database,
    // every attempt times out and pg throws an empty AggregateError (ETIMEDOUT).
    const { getDefaultAutoSelectFamilyAttemptTimeout, setDefaultAutoSelectFamilyAttemptTimeout } = await import('node:net');
    if (getDefaultAutoSelectFamilyAttemptTimeout() < 2_000) setDefaultAutoSelectFamilyAttemptTimeout(2_000);
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 15_000 });
    return {
      query: async (text, params) => (await pool.query(text, params)).rows,
      exec: async (text) => void (await pool.query(text)),
      close: () => pool.end(),
    };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const dir = process.env.PGLITE_DIR ?? '.data/pglite';
  if (dir !== 'memory://') mkdirSync(dir, { recursive: true });
  const pg = await PGlite.create(dir);
  return {
    query: async <T,>(text: string, params?: unknown[]) => (await pg.query<T>(text, params)).rows,
    exec: async (text) => void (await pg.exec(text)),
    close: () => pg.close(),
  };
}

const g = globalThis as unknown as { __vitalsignsDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  g.__vitalsignsDb ??= connect()
    .then(async (db) => {
      await db.exec(SCHEMA).catch(async (err) => {
        await db.close().catch(() => {});
        throw err;
      });
      return db;
    })
    .catch((err) => {
      // Don't cache a failed connection: let the next request retry.
      g.__vitalsignsDb = undefined;
      throw err;
    });
  return g.__vitalsignsDb;
}

export async function sql<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> {
  return (await getDb()).query<T>(text, params);
}

export async function closeDb() {
  const db = g.__vitalsignsDb;
  g.__vitalsignsDb = undefined;
  if (db) await (await db).close();
}
