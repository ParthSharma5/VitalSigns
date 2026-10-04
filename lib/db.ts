import { mkdirSync } from 'node:fs';
import { SCHEMA } from './schema';

export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  exec(text: string): Promise<void>;
  close(): Promise<void>;
}

async function connect(): Promise<Db> {
  if (process.env.DATABASE_URL) {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
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
  g.__vitalsignsDb ??= connect().then(async (db) => {
    await db.exec(SCHEMA);
    return db;
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
