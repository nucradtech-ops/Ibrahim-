import { escapeLike, normalizeArabic, searchTerms } from './arabic';
import { hijriFromISO, isValidISODate, yearOf } from './dates';
import {
  Db,
  Mosque,
  MosqueWithCount,
  NO_CATEGORY,
  NO_MOSQUE,
  Sermon,
  SermonFilters,
  SermonInput,
  SermonListItem,
} from './types';

export class ValidationError extends Error {
  constructor(public field: string, message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

const nowISO = () => new Date().toISOString();
const clean = (s: string | null | undefined) => {
  const t = (s ?? '').trim();
  return t.length ? t : null;
};

// ====================== المساجد ======================

export async function listMosques(db: Db, search = ''): Promise<MosqueWithCount[]> {
  const terms = searchTerms(search);
  const where = terms.map(() => `m.name_norm LIKE ? ESCAPE '\\'`).join(' AND ');
  const params = terms.map((t) => `%${escapeLike(t)}%`);
  return db.getAllAsync<MosqueWithCount>(
    `SELECT m.id, m.name, m.notes, m.created_at,
            (SELECT COUNT(*) FROM sermons s WHERE s.mosque_id = m.id) AS sermon_count
       FROM mosques m
      ${where ? 'WHERE ' + where : ''}
      ORDER BY m.name_norm`,
    params,
  );
}

export async function getMosque(db: Db, id: number): Promise<MosqueWithCount | null> {
  return db.getFirstAsync<MosqueWithCount>(
    `SELECT m.id, m.name, m.notes, m.created_at,
            (SELECT COUNT(*) FROM sermons s WHERE s.mosque_id = m.id) AS sermon_count
       FROM mosques m WHERE m.id = ?`,
    [id],
  );
}

export async function addMosque(db: Db, name: string, notes?: string | null): Promise<Mosque> {
  const n = name.trim().replace(/\s+/g, ' ');
  if (!n) throw new ValidationError('name', 'اسم المسجد مطلوب');
  const norm = normalizeArabic(n);
  const dup = await db.getFirstAsync<Mosque>('SELECT * FROM mosques WHERE name_norm = ?', [norm]);
  if (dup) throw new ValidationError('name', 'هذا المسجد مسجّل مسبقًا');
  const r = await db.runAsync('INSERT INTO mosques (name, name_norm, notes, created_at) VALUES (?, ?, ?, ?)', [
    n,
    norm,
    clean(notes),
    nowISO(),
  ]);
  return (await getMosque(db, r.lastInsertRowId))!;
}

/** يعيد المسجد الموجود بنفس الاسم أو يُنشئه. */
export async function findOrCreateMosque(db: Db, name: string): Promise<Mosque> {
  const n = name.trim().replace(/\s+/g, ' ');
  if (!n) throw new ValidationError('name', 'اسم المسجد مطلوب');
  const found = await db.getFirstAsync<Mosque>('SELECT * FROM mosques WHERE name_norm = ?', [normalizeArabic(n)]);
  return found ?? addMosque(db, n);
}

export async function updateMosque(db: Db, id: number, name: string, notes?: string | null): Promise<void> {
  const n = name.trim().replace(/\s+/g, ' ');
  if (!n) throw new ValidationError('name', 'اسم المسجد مطلوب');
  const norm = normalizeArabic(n);
  const dup = await db.getFirstAsync<{ id: number }>('SELECT id FROM mosques WHERE name_norm = ? AND id <> ?', [norm, id]);
  if (dup) throw new ValidationError('name', 'يوجد مسجد آخر بنفس الاسم');
  await db.runAsync('UPDATE mosques SET name = ?, name_norm = ?, notes = ? WHERE id = ?', [n, norm, clean(notes), id]);
}

export type MosqueDeleteMode = 'detach' | 'move';

/**
 * حذف مسجد: إن كان له خطب فيجب تحديد الخيار:
 *  - detach: تبقى الخطب وتصبح بلا مسجد.
 *  - move: تُنقل الخطب إلى مسجد آخر (moveToId).
 * لا تُحذف الخطب أبدًا.
 */
export async function deleteMosque(
  db: Db,
  id: number,
  opts: { mode?: MosqueDeleteMode; moveToId?: number } = {},
): Promise<{ affectedSermons: number }> {
  const m = await getMosque(db, id);
  if (!m) return { affectedSermons: 0 };
  if (m.sermon_count > 0 && !opts.mode) {
    throw new ValidationError('mode', `المسجد مرتبط بـ ${m.sermon_count} خطبة؛ اختر نقلها أو إبقاءها بلا مسجد`);
  }
  await db.withTransactionAsync(async () => {
    if (m.sermon_count > 0) {
      if (opts.mode === 'move') {
        if (!opts.moveToId || opts.moveToId === id) throw new ValidationError('moveToId', 'اختر مسجدًا آخر للنقل إليه');
        const target = await getMosque(db, opts.moveToId);
        if (!target) throw new ValidationError('moveToId', 'المسجد الهدف غير موجود');
        await db.runAsync('UPDATE sermons SET mosque_id = ?, updated_at = ? WHERE mosque_id = ?', [opts.moveToId, nowISO(), id]);
      } else {
        await db.runAsync('UPDATE sermons SET mosque_id = NULL, updated_at = ? WHERE mosque_id = ?', [nowISO(), id]);
      }
    }
    await db.runAsync('DELETE FROM mosques WHERE id = ?', [id]);
  });
  return { affectedSermons: m.sermon_count };
}

// ====================== التصنيفات ======================

export async function listCategories(db: Db): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>(
    `SELECT name FROM categories
     UNION
     SELECT DISTINCT category FROM sermons WHERE category IS NOT NULL
     ORDER BY 1`,
  );
  return rows.map((r) => r.name);
}

export async function ensureCategory(db: Db, name: string | null): Promise<void> {
  const n = clean(name);
  if (!n) return;
  await db.runAsync('INSERT OR IGNORE INTO categories (name, name_norm) VALUES (?, ?)', [n, normalizeArabic(n)]);
}

// ====================== الخطب ======================

export async function nextSerial(db: Db): Promise<number> {
  const max = await db.getFirstAsync<{ m: number | null }>('SELECT MAX(serial) AS m FROM sermons');
  const last = await db.getFirstAsync<{ value: string | null }>("SELECT value FROM meta WHERE key = 'last_serial'");
  return Math.max(max?.m ?? 0, Number(last?.value ?? 0)) + 1;
}

function validateSermon(input: SermonInput): void {
  if (!input.title?.trim()) throw new ValidationError('title', 'موضوع الخطبة مطلوب');
  if (!isValidISODate(input.sermon_date)) throw new ValidationError('sermon_date', 'تاريخ الخطبة مطلوب وبصيغة صحيحة');
  if (!input.body?.trim()) throw new ValidationError('body', 'نص الخطبة مطلوب');
}

const SERMON_SELECT = `
  SELECT s.id, s.serial, s.title, s.sermon_date, s.hijri_date, s.mosque_id, m.name AS mosque_name,
         s.sermon_number, s.body, s.notes, s.category, s.year, s.created_at, s.updated_at
    FROM sermons s LEFT JOIN mosques m ON m.id = s.mosque_id`;

export async function getSermon(db: Db, id: number): Promise<Sermon | null> {
  return db.getFirstAsync<Sermon>(`${SERMON_SELECT} WHERE s.id = ?`, [id]);
}

export async function getSermonBySerial(db: Db, serial: number): Promise<Sermon | null> {
  return db.getFirstAsync<Sermon>(`${SERMON_SELECT} WHERE s.serial = ?`, [serial]);
}

export async function addSermon(db: Db, input: SermonInput): Promise<Sermon> {
  validateSermon(input);
  let newId = 0;
  await db.withTransactionAsync(async () => {
    const serial = await nextSerial(db);
    const title = input.title.trim();
    const body = input.body.trim();
    const notes = clean(input.notes);
    const category = clean(input.category);
    const ts = nowISO();
    const r = await db.runAsync(
      `INSERT INTO sermons (serial, title, title_norm, sermon_date, hijri_date, mosque_id, sermon_number,
                            body, body_norm, notes, notes_norm, category, year, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        serial,
        title,
        normalizeArabic(title),
        input.sermon_date,
        clean(input.hijri_date) ?? hijriFromISO(input.sermon_date),
        input.mosque_id ?? null,
        clean(input.sermon_number),
        body,
        normalizeArabic(body),
        notes,
        notes ? normalizeArabic(notes) : null,
        category,
        yearOf(input.sermon_date),
        ts,
        ts,
      ],
    );
    newId = r.lastInsertRowId;
    await ensureCategory(db, category);
    await db.runAsync(
      "INSERT INTO meta (key, value) VALUES ('last_serial', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [String(serial)],
    );
  });
  return (await getSermon(db, newId))!;
}

export async function updateSermon(db: Db, id: number, input: SermonInput): Promise<Sermon> {
  validateSermon(input);
  const existing = await getSermon(db, id);
  if (!existing) throw new ValidationError('id', 'الخطبة غير موجودة');
  const title = input.title.trim();
  const body = input.body.trim();
  const notes = clean(input.notes);
  const category = clean(input.category);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE sermons SET title=?, title_norm=?, sermon_date=?, hijri_date=?, mosque_id=?, sermon_number=?,
              body=?, body_norm=?, notes=?, notes_norm=?, category=?, year=?, updated_at=? WHERE id=?`,
      [
        title,
        normalizeArabic(title),
        input.sermon_date,
        clean(input.hijri_date) ?? hijriFromISO(input.sermon_date),
        input.mosque_id ?? null,
        clean(input.sermon_number),
        body,
        normalizeArabic(body),
        notes,
        notes ? normalizeArabic(notes) : null,
        category,
        yearOf(input.sermon_date),
        nowISO(),
        id,
      ],
    );
    await ensureCategory(db, category);
  });
  return (await getSermon(db, id))!;
}

export async function deleteSermon(db: Db, id: number): Promise<void> {
  await db.runAsync('DELETE FROM sermons WHERE id = ?', [id]);
}

function orderBy(sort: SermonFilters['sort']): string {
  switch (sort) {
    case 'date_asc':
      return 's.sermon_date ASC, s.serial ASC';
    case 'serial_desc':
      return 's.serial DESC';
    case 'serial_asc':
      return 's.serial ASC';
    case 'title_asc':
      return 's.title_norm ASC, s.serial ASC';
    case 'date_desc':
    default:
      return 's.sermon_date DESC, s.serial DESC';
  }
}

function buildWhere(f: SermonFilters): { where: string; params: (string | number)[] } {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  // كل كلمة يجب أن تظهر في أحد الحقول (AND بين الكلمات، OR بين الحقول)
  for (const term of searchTerms(f.query ?? '')) {
    const like = `%${escapeLike(term)}%`;
    const parts = [
      `s.title_norm LIKE ? ESCAPE '\\'`,
      `s.body_norm LIKE ? ESCAPE '\\'`,
      `s.notes_norm LIKE ? ESCAPE '\\'`,
      `m.name_norm LIKE ? ESCAPE '\\'`,
      `s.sermon_date LIKE ? ESCAPE '\\'`,
      `lower(coalesce(s.sermon_number,'')) LIKE ? ESCAPE '\\'`,
      `s.category LIKE ? ESCAPE '\\'`,
    ];
    params.push(like, like, like, like, like, like, like);
    if (/^\d+$/.test(term)) {
      parts.push('s.serial = ?');
      params.push(Number(term));
    }
    clauses.push(`(${parts.join(' OR ')})`);
  }

  if (f.mosqueId === NO_MOSQUE) clauses.push('s.mosque_id IS NULL');
  else if (f.mosqueId != null) {
    clauses.push('s.mosque_id = ?');
    params.push(f.mosqueId);
  }
  if (f.category === NO_CATEGORY) clauses.push('s.category IS NULL');
  else if (f.category) {
    clauses.push('s.category = ?');
    params.push(f.category);
  }
  if (f.year != null) {
    clauses.push('s.year = ?');
    params.push(f.year);
  }
  if (f.dateFrom) {
    clauses.push('s.sermon_date >= ?');
    params.push(f.dateFrom);
  }
  if (f.dateTo) {
    clauses.push('s.sermon_date <= ?');
    params.push(f.dateTo);
  }
  return { where: clauses.length ? 'WHERE ' + clauses.join(' AND ') : '', params };
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  /** يعيد نص الخطبة مع كل صف (لعرض المقتطف في نتائج البحث). */
  withBody?: boolean;
}

export async function searchSermons(
  db: Db,
  filters: SermonFilters = {},
  opts: SearchOptions = {},
): Promise<{ items: SermonListItem[]; total: number }> {
  const { where, params } = buildWhere(filters);
  const from = 'FROM sermons s LEFT JOIN mosques m ON m.id = s.mosque_id';
  const totalRow = await db.getFirstAsync<{ c: number }>(`SELECT COUNT(*) AS c ${from} ${where}`, params);
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const items = await db.getAllAsync<SermonListItem>(
    `SELECT s.id, s.serial, s.title, s.sermon_date, s.mosque_id, m.name AS mosque_name,
            s.sermon_number, s.category${opts.withBody ? ', s.body' : ''}
       ${from} ${where}
      ORDER BY ${orderBy(filters.sort)}
      LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return { items, total: totalRow?.c ?? 0 };
}

/** كل الخطب كاملة (للتصدير) وفق نفس عوامل التصفية. */
export async function getAllSermonsFull(db: Db, filters: SermonFilters = {}): Promise<Sermon[]> {
  const { where, params } = buildWhere(filters);
  return db.getAllAsync<Sermon>(
    `${SERMON_SELECT.replace('FROM sermons s LEFT JOIN mosques m ON m.id = s.mosque_id', '')}
      FROM sermons s LEFT JOIN mosques m ON m.id = s.mosque_id
      ${where} ORDER BY ${orderBy(filters.sort ?? 'serial_asc')}`,
    params,
  );
}

export async function getSermonsByIds(db: Db, ids: number[]): Promise<Sermon[]> {
  if (!ids.length) return [];
  const ph = ids.map(() => '?').join(',');
  return db.getAllAsync<Sermon>(`${SERMON_SELECT} WHERE s.id IN (${ph}) ORDER BY s.serial ASC`, ids);
}

export async function listYears(db: Db): Promise<number[]> {
  const rows = await db.getAllAsync<{ year: number }>('SELECT DISTINCT year FROM sermons ORDER BY year DESC');
  return rows.map((r) => r.year);
}

// ====================== الإحصائيات ======================

export interface Counted {
  label: string;
  count: number;
}

export interface Stats {
  totalSermons: number;
  totalMosques: number;
  thisMonth: number;
  byYear: Counted[];
  byMosque: Counted[];
  byCategory: Counted[];
}

export async function getStats(db: Db, month: { from: string; to: string }): Promise<Stats> {
  const total = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM sermons');
  const mosques = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM mosques');
  const mon = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) AS c FROM sermons WHERE sermon_date >= ? AND sermon_date <= ?',
    [month.from, month.to],
  );
  return {
    totalSermons: total?.c ?? 0,
    totalMosques: mosques?.c ?? 0,
    thisMonth: mon?.c ?? 0,
    byYear: await countBy(db, 'CAST(year AS TEXT)', undefined, 'year DESC'),
    byMosque: await countBy(db, "coalesce(m.name, 'بدون مسجد')", undefined, 'c DESC, label'),
    byCategory: await countBy(db, "coalesce(s.category, 'بدون تصنيف')", undefined, 'c DESC, label'),
  };
}

export interface PeriodRange {
  dateFrom?: string | null;
  dateTo?: string | null;
}

/** تقرير مفصّل لفترة محددة. */
export async function getPeriodReport(db: Db, range: PeriodRange) {
  const f: SermonFilters = { dateFrom: range.dateFrom, dateTo: range.dateTo };
  const { where, params } = buildWhere(f);
  const total = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM sermons s LEFT JOIN mosques m ON m.id = s.mosque_id ${where}`,
    params,
  );
  return {
    total: total?.c ?? 0,
    byYear: await countBy(db, 'CAST(s.year AS TEXT)', { where, params }, 'label DESC'),
    byMosque: await countBy(db, "coalesce(m.name, 'بدون مسجد')", { where, params }, 'c DESC, label'),
    byCategory: await countBy(db, "coalesce(s.category, 'بدون تصنيف')", { where, params }, 'c DESC, label'),
  };
}

async function countBy(
  db: Db,
  labelExpr: string,
  w: { where: string; params: (string | number)[] } | undefined,
  order: string,
): Promise<Counted[]> {
  const labelExprFixed = labelExpr.replace(/^CAST\(year/, 'CAST(s.year');
  const rows = await db.getAllAsync<{ label: string; c: number }>(
    `SELECT ${labelExprFixed} AS label, COUNT(*) AS c
       FROM sermons s LEFT JOIN mosques m ON m.id = s.mosque_id
       ${w?.where ?? ''}
      GROUP BY label ORDER BY ${order.replace(/\byear\b/, 'label')}`,
    w?.params ?? [],
  );
  return rows.map((r) => ({ label: r.label, count: r.c }));
}
