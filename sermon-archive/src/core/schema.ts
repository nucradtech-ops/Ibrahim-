import type { Db } from './types';

/** رقم إصدار المخطط الحالي. زِد الرقم وأضف خطوة هجرة جديدة عند أي تغيير مستقبلي (دون حذف البيانات). */
export const SCHEMA_VERSION = 1;

export const DEFAULT_CATEGORIES = [
  'العقيدة',
  'العبادات',
  'الأخلاق',
  'الأسرة',
  'المناسبات الدينية',
  'المعاملات',
  'السيرة النبوية',
  'قضايا معاصرة',
];

const V1 = `
CREATE TABLE IF NOT EXISTS mosques (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_norm TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mosques_name_norm ON mosques(name_norm);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_norm TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name_norm ON categories(name_norm);

CREATE TABLE IF NOT EXISTS sermons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  serial INTEGER NOT NULL,
  title TEXT NOT NULL,
  title_norm TEXT NOT NULL,
  sermon_date TEXT NOT NULL,
  hijri_date TEXT,
  mosque_id INTEGER REFERENCES mosques(id) ON DELETE SET NULL,
  sermon_number TEXT,
  body TEXT NOT NULL,
  body_norm TEXT NOT NULL,
  notes TEXT,
  notes_norm TEXT,
  category TEXT,
  year INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sermons_serial ON sermons(serial);
CREATE INDEX IF NOT EXISTS idx_sermons_title ON sermons(title_norm);
CREATE INDEX IF NOT EXISTS idx_sermons_date ON sermons(sermon_date);
CREATE INDEX IF NOT EXISTS idx_sermons_mosque ON sermons(mosque_id);
CREATE INDEX IF NOT EXISTS idx_sermons_category ON sermons(category);
CREATE INDEX IF NOT EXISTS idx_sermons_year ON sermons(year);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT
);
`;

/**
 * يهيّئ قاعدة البيانات ويطبّق الهجرات عبر PRAGMA user_version.
 * آمن للاستدعاء في كل تشغيل، ولا يحذف أي بيانات موجودة.
 */
export async function migrate(db: Db): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current >= SCHEMA_VERSION) return;

  if (current < 1) {
    await db.execAsync(V1);
    // تصنيفات مبدئية
    const { normalizeArabic } = await import('./arabic');
    for (const c of DEFAULT_CATEGORIES) {
      await db.runAsync('INSERT OR IGNORE INTO categories (name, name_norm) VALUES (?, ?)', [c, normalizeArabic(c)]);
    }
  }
  // مثال لهجرة مستقبلية:
  // if (current < 2) { await db.execAsync('ALTER TABLE sermons ADD COLUMN ...'); }

  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}
