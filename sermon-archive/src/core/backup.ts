import { sha256 } from 'js-sha256';
import { normalizeArabic } from './arabic';
import { hijriFromISO, isValidISODate, yearOf } from './dates';
import { migrate } from './schema';
import type { Db } from './types';

export const APP_NAME = 'أرشيف الخطب';
export const BACKUP_FORMAT = 'arshif-alkhutab-backup';
export const BACKUP_VERSION = 1;

export interface BackupData {
  mosques: { id: number; name: string; notes: string | null; created_at: string }[];
  categories: string[];
  sermons: {
    serial: number;
    title: string;
    sermon_date: string;
    hijri_date: string | null;
    mosque_id: number | null;
    sermon_number: string | null;
    body: string;
    notes: string | null;
    category: string | null;
    created_at: string;
    updated_at: string;
  }[];
  settings: Record<string, string>;
}

export interface BackupFile {
  format: string;
  version: number;
  app: string;
  created_at: string;
  counts: { sermons: number; mosques: number };
  checksum: string; // SHA-256 لمحتوى data كما سُلسِل
  data: BackupData;
}

export const checksumOf = (data: BackupData) => sha256(JSON.stringify(data));

export async function createBackup(db: Db, settings: Record<string, string> = {}): Promise<BackupFile> {
  const mosques = await db.getAllAsync<BackupData['mosques'][number]>(
    'SELECT id, name, notes, created_at FROM mosques ORDER BY id',
  );
  const categories = (await db.getAllAsync<{ name: string }>('SELECT name FROM categories ORDER BY id')).map((c) => c.name);
  const sermons = await db.getAllAsync<BackupData['sermons'][number]>(
    `SELECT serial, title, sermon_date, hijri_date, mosque_id, sermon_number, body, notes, category, created_at, updated_at
       FROM sermons ORDER BY serial`,
  );
  const data: BackupData = { mosques, categories, sermons, settings };
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    app: APP_NAME,
    created_at: new Date().toISOString(),
    counts: { sermons: sermons.length, mosques: mosques.length },
    checksum: checksumOf(data),
    data,
  };
}

export interface BackupCheck {
  ok: boolean;
  errors: string[];
  backup?: BackupFile;
}

/** يتحقق من سلامة ملف النسخة الاحتياطية قبل الاستعادة. لا يلمس قاعدة البيانات. */
export function verifyBackup(text: string): BackupCheck {
  const errors: string[] = [];
  let obj: any;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['الملف ليس نسخة احتياطية صالحة (JSON غير مقروء)'] };
  }
  if (!obj || obj.format !== BACKUP_FORMAT) return { ok: false, errors: ['الملف ليس نسخة احتياطية لتطبيق أرشيف الخطب'] };
  if (typeof obj.version !== 'number' || obj.version > BACKUP_VERSION) {
    return { ok: false, errors: ['إصدار النسخة أحدث من إصدار التطبيق، حدّث التطبيق أولًا'] };
  }
  const d = obj.data;
  if (!d || !Array.isArray(d.sermons) || !Array.isArray(d.mosques) || !Array.isArray(d.categories)) {
    return { ok: false, errors: ['بنية النسخة الاحتياطية ناقصة'] };
  }
  if (checksumOf(d) !== obj.checksum) errors.push('بصمة الملف لا تطابق محتواه: الملف تالف أو عُدّل');

  const mosqueIds = new Set<number>();
  for (const m of d.mosques) {
    if (!Number.isInteger(m.id) || typeof m.name !== 'string' || !m.name.trim()) errors.push('بيانات مسجد غير صالحة');
    else mosqueIds.add(m.id);
  }
  const serials = new Set<number>();
  d.sermons.forEach((s: any, i: number) => {
    const tag = `الخطبة رقم ${i + 1}`;
    if (!Number.isInteger(s.serial) || s.serial < 1) errors.push(`${tag}: رقم مسلسل غير صالح`);
    else if (serials.has(s.serial)) errors.push(`${tag}: رقم مسلسل مكرر (${s.serial})`);
    else serials.add(s.serial);
    if (typeof s.title !== 'string' || !s.title.trim()) errors.push(`${tag}: الموضوع فارغ`);
    if (!isValidISODate(s.sermon_date)) errors.push(`${tag}: تاريخ غير صالح`);
    if (typeof s.body !== 'string' || !s.body.trim()) errors.push(`${tag}: النص فارغ`);
    if (s.mosque_id != null && !mosqueIds.has(s.mosque_id)) errors.push(`${tag}: مسجد غير موجود في النسخة`);
  });
  if (errors.length) return { ok: false, errors: errors.slice(0, 10) };
  return { ok: true, errors: [], backup: obj as BackupFile };
}

/**
 * يستبدل كل بيانات قاعدة البيانات بمحتوى النسخة، داخل معاملة واحدة:
 * عند أي خطأ تُلغى العملية كلها وتبقى البيانات الحالية كما هي.
 */
export async function restoreBackup(db: Db, backup: BackupFile): Promise<{ sermons: number; mosques: number }> {
  const d = backup.data;
  await migrate(db);
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM sermons');
    await db.runAsync('DELETE FROM mosques');
    await db.runAsync('DELETE FROM categories');
    await db.runAsync("DELETE FROM meta WHERE key = 'last_serial'");
    for (const m of d.mosques) {
      await db.runAsync('INSERT INTO mosques (id, name, name_norm, notes, created_at) VALUES (?,?,?,?,?)', [
        m.id,
        m.name,
        normalizeArabic(m.name),
        m.notes,
        m.created_at,
      ]);
    }
    for (const c of d.categories) {
      await db.runAsync('INSERT OR IGNORE INTO categories (name, name_norm) VALUES (?,?)', [c, normalizeArabic(c)]);
    }
    let maxSerial = 0;
    for (const s of d.sermons) {
      maxSerial = Math.max(maxSerial, s.serial);
      await db.runAsync(
        `INSERT INTO sermons (serial, title, title_norm, sermon_date, hijri_date, mosque_id, sermon_number,
                              body, body_norm, notes, notes_norm, category, year, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          s.serial,
          s.title,
          normalizeArabic(s.title),
          s.sermon_date,
          s.hijri_date ?? hijriFromISO(s.sermon_date),
          s.mosque_id,
          s.sermon_number,
          s.body,
          normalizeArabic(s.body),
          s.notes,
          s.notes ? normalizeArabic(s.notes) : null,
          s.category,
          yearOf(s.sermon_date),
          s.created_at,
          s.updated_at,
        ],
      );
      if (s.category) {
        await db.runAsync('INSERT OR IGNORE INTO categories (name, name_norm) VALUES (?,?)', [
          s.category,
          normalizeArabic(s.category),
        ]);
      }
    }
    await db.runAsync("INSERT INTO meta (key, value) VALUES ('last_serial', ?)", [String(maxSerial)]);
  });
  return { sermons: d.sermons.length, mosques: d.mosques.length };
}
