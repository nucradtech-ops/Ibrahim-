import { normalizeArabic } from './arabic';
import { addSermon, findOrCreateMosque } from './repo';
import type { ImportRow } from './tabular';
import type { Db } from './types';

/** يحدد الصفوف المكررة (نفس الموضوع والتاريخ، أو نفس النص) سواء في قاعدة البيانات أو داخل الملف نفسه. */
export async function markDuplicates(db: Db, rows: ImportRow[]): Promise<ImportRow[]> {
  const existing = await db.getAllAsync<{ title_norm: string; sermon_date: string; body_norm: string }>(
    'SELECT title_norm, sermon_date, body_norm FROM sermons',
  );
  const keys = new Set(existing.map((e) => `${e.title_norm}|${e.sermon_date}`));
  const bodies = new Set(existing.map((e) => e.body_norm));
  return rows.map((r) => {
    if (r.status === 'invalid') return r;
    const k = `${normalizeArabic(r.input.title)}|${r.input.sermon_date}`;
    const b = normalizeArabic(r.input.body);
    if (keys.has(k) || bodies.has(b)) return { ...r, status: 'duplicate', problems: ['مكررة (موجودة مسبقًا)'] };
    keys.add(k);
    bodies.add(b);
    return r;
  });
}

export interface ImportResult {
  added: number;
  skippedDuplicates: number;
  skippedInvalid: number;
}

/**
 * يضيف الصفوف الجديدة فقط (والمكررة إن طُلب ذلك صراحةً). لا يستبدل أو يعدّل أي خطبة موجودة.
 * الأرقام المسلسلة تُولَّد دائمًا تلقائيًا لضمان عدم التكرار.
 */
export async function applyImport(db: Db, rows: ImportRow[], opts: { includeDuplicates?: boolean } = {}): Promise<ImportResult> {
  const res: ImportResult = { added: 0, skippedDuplicates: 0, skippedInvalid: 0 };
  for (const r of rows) {
    if (r.status === 'invalid') {
      res.skippedInvalid++;
      continue;
    }
    if (r.status === 'duplicate' && !opts.includeDuplicates) {
      res.skippedDuplicates++;
      continue;
    }
    const mosque = r.mosqueName ? await findOrCreateMosque(db, r.mosqueName) : null;
    await addSermon(db, { ...r.input, mosque_id: mosque?.id ?? null });
    res.added++;
  }
  return res;
}
