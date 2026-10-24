import * as XLSX from 'xlsx';
import { normalizeArabic } from './arabic';
import { formatGregorian, parseFlexibleDate } from './dates';
import type { Sermon, SermonInput } from './types';

export const COLUMNS = [
  { key: 'serial', header: 'الرقم المسلسل' },
  { key: 'title', header: 'موضوع الخطبة' },
  { key: 'sermon_date', header: 'التاريخ' },
  { key: 'hijri_date', header: 'التاريخ الهجري' },
  { key: 'mosque_name', header: 'اسم المسجد' },
  { key: 'sermon_number', header: 'رقم الخطبة' },
  { key: 'category', header: 'التصنيف' },
  { key: 'notes', header: 'ملاحظات' },
  { key: 'body', header: 'نص الخطبة' },
] as const;

// حد خلية Excel 32767 حرفًا؛ نقسّم النص الأطول على أعمدة إضافية حتى لا يضيع شيء.
const CELL_LIMIT = 32000;

function rowsOf(sermons: Sermon[]): string[][] {
  const maxParts = Math.max(1, ...sermons.map((s) => Math.ceil(s.body.length / CELL_LIMIT)));
  const header: string[] = COLUMNS.map((c) => c.header);
  for (let i = 2; i <= maxParts; i++) header.push(`نص الخطبة (تابع ${i})`);
  const rows = [header];
  for (const s of sermons) {
    const base = COLUMNS.slice(0, -1).map((c) => String((s as any)[c.key] ?? ''));
    const parts: string[] = [];
    for (let i = 0; i < Math.max(1, Math.ceil(s.body.length / CELL_LIMIT)); i++) {
      parts.push(s.body.slice(i * CELL_LIMIT, (i + 1) * CELL_LIMIT));
    }
    while (parts.length < maxParts) parts.push('');
    rows.push([...base, ...parts]);
  }
  return rows;
}

/** ملف Excel (xlsx) مُشفَّر كـ base64 مع واجهة من اليمين لليسار. */
export function sermonsToXlsxBase64(sermons: Sermon[], sheetName = 'الخطب'): string {
  const ws = XLSX.utils.aoa_to_sheet(rowsOf(sermons));
  ws['!cols'] = [{ wch: 10 }, { wch: 40 }, { wch: 14 }, { wch: 18 }, { wch: 28 }, { wch: 12 }, { wch: 18 }, { wch: 30 }, { wch: 100 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  (wb as any).Workbook = { Views: [{ RTL: true }] };
  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
}

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);

/** CSV بترميز UTF-8 مع BOM ليفتحه Excel بالعربية صحيحًا. */
export function sermonsToCsv(sermons: Sermon[]): string {
  const rows = rowsOf(sermons);
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function aoaToXlsxBase64(rows: (string | number)[][], sheetName: string): string {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = rows[0]?.map(() => ({ wch: 28 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  (wb as any).Workbook = { Views: [{ RTL: true }] };
  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
}

// ---------------- الاستيراد ----------------

export interface ImportRow {
  line: number; // رقم السطر في الملف (للمستخدم)
  input: SermonInput;
  mosqueName: string | null;
  requestedSerial: number | null;
  status: 'new' | 'duplicate' | 'invalid';
  problems: string[];
}

const HEADER_ALIASES: Record<string, string[]> = {
  serial: ['الرقم المسلسل', 'المسلسل', 'serial'],
  title: ['موضوع الخطبة', 'الموضوع', 'العنوان', 'title'],
  sermon_date: ['التاريخ', 'تاريخ الخطبة', 'date'],
  hijri_date: ['التاريخ الهجري', 'الهجري'],
  mosque_name: ['اسم المسجد', 'المسجد', 'mosque'],
  sermon_number: ['رقم الخطبة', 'رقم'],
  category: ['التصنيف', 'category'],
  notes: ['ملاحظات', 'notes'],
  body: ['نص الخطبة', 'النص', 'body', 'text'],
};

const aliasMap = (() => {
  const m = new Map<string, string>();
  for (const [key, list] of Object.entries(HEADER_ALIASES)) for (const a of list) m.set(normalizeArabic(a), key);
  return m;
})();

/** يحوّل أول ورقة من xlsx/csv (مصفوفة صفوف) إلى صفوف استيراد مع التحقق. */
export function parseTable(aoa: any[][]): { rows: ImportRow[]; error?: string } {
  if (!aoa.length) return { rows: [], error: 'الملف فارغ' };
  const headerRow = aoa[0].map((h) => aliasMap.get(normalizeArabic(String(h ?? ''))) ?? null);
  if (!headerRow.includes('title') || !headerRow.includes('body') || !headerRow.includes('sermon_date')) {
    return { rows: [], error: 'يجب أن يحتوي الملف على الأعمدة: موضوع الخطبة، التاريخ، نص الخطبة' };
  }
  const bodyCols = aoa[0]
    .map((h, i) => ({ h: String(h ?? ''), i }))
    .filter(({ h, i }) => headerRow[i] === 'body' || /^نص الخطبة \(تابع \d+\)$/.test(h.trim()))
    .map((x) => x.i);

  const rows: ImportRow[] = [];
  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row || row.every((c) => c === undefined || c === null || String(c).trim() === '')) continue;
    const get = (key: string) => {
      const i = headerRow.indexOf(key);
      return i >= 0 && row[i] !== undefined && row[i] !== null ? String(row[i]).trim() : '';
    };
    const problems: string[] = [];
    const title = get('title');
    const body = bodyCols.map((i) => (row[i] == null ? '' : String(row[i]))).join('').trim();
    const dateRaw = row[headerRow.indexOf('sermon_date')];
    let date: string | null = null;
    if (typeof dateRaw === 'number') {
      // رقم تسلسلي لتاريخ Excel
      const p = XLSX.SSF.parse_date_code(dateRaw);
      if (p) date = parseFlexibleDate(`${p.y}-${p.m}-${p.d}`);
    } else if (dateRaw instanceof Date) {
      date = parseFlexibleDate(`${dateRaw.getFullYear()}-${dateRaw.getMonth() + 1}-${dateRaw.getDate()}`);
    } else date = parseFlexibleDate(String(dateRaw ?? ''));
    if (!title) problems.push('الموضوع فارغ');
    if (!date) problems.push('التاريخ غير مقروء');
    if (!body) problems.push('النص فارغ');
    const serialRaw = get('serial');
    const serial = /^\d+$/.test(serialRaw) ? Number(serialRaw) : null;
    rows.push({
      line: r + 1,
      input: {
        title,
        sermon_date: date ?? '',
        hijri_date: get('hijri_date') || null,
        sermon_number: get('sermon_number') || null,
        body,
        notes: get('notes') || null,
        category: get('category') || null,
      },
      mosqueName: get('mosque_name') || null,
      requestedSerial: serial,
      status: problems.length ? 'invalid' : 'new',
      problems,
    });
  }
  return { rows };
}

export function parseXlsxBase64(b64: string): { rows: ImportRow[]; error?: string } {
  try {
    const wb = XLSX.read(b64, { type: 'base64', cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return { rows: [], error: 'لا توجد أوراق في الملف' };
    return parseTable(XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: '' }));
  } catch {
    return { rows: [], error: 'تعذّرت قراءة ملف Excel' };
  }
}

export function parseCsvText(text: string): { rows: ImportRow[]; error?: string } {
  const t = text.replace(/^﻿/, '');
  const aoa: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(cell);
      aoa.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    aoa.push(row);
  }
  return parseTable(aoa);
}

export { formatGregorian };
