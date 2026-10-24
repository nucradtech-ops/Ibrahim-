import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../src/core/schema';
import type { Db, SqlParam } from '../src/core/types';

/** يحاكي واجهة expo-sqlite غير المتزامنة فوق node:sqlite (نفس محرك SQLite). */
export function makeDb(path = ':memory:'): Db & { raw: DatabaseSync; close(): void } {
  const raw = new DatabaseSync(path);
  let depth = 0;
  const db = {
    raw,
    close: () => raw.close(),
    async execAsync(sql: string) {
      raw.exec(sql);
    },
    async runAsync(sql: string, params: SqlParam[] = []) {
      const r = raw.prepare(sql).run(...params);
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    async getAllAsync(sql: string, params: SqlParam[] = []) {
      return raw.prepare(sql).all(...params) as any[];
    },
    async getFirstAsync(sql: string, params: SqlParam[] = []) {
      return (raw.prepare(sql).get(...params) as any) ?? null;
    },
    async withTransactionAsync(task: () => Promise<void>) {
      if (depth > 0) return task();
      raw.exec('BEGIN');
      depth++;
      try {
        await task();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
  return db as any;
}

export async function freshDb(path?: string) {
  const db = makeDb(path);
  await migrate(db);
  return db;
}
