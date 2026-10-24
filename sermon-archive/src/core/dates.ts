/**
 * التواريخ: الميلادي يُخزَّن بصيغة YYYY-MM-DD (توقيت محلي)،
 * والهجري يُحسب بالخوارزمية الجدولية (Umm al-Qura تقريبًا، قد يختلف يومًا واحدًا) ويمكن للمستخدم تعديله.
 */

export const GREGORIAN_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

export const HIJRI_MONTHS = [
  'محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة',
  'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة',
];

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function toISODate(d: Date): string {
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(now: Date = new Date()): string {
  return toISODate(now);
}

export function isValidISODate(s: string | null | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0); // الظهر لتجنب مشاكل التوقيت الصيفي
}

export function yearOf(iso: string): number {
  return Number(iso.slice(0, 4));
}

export function monthRange(now: Date = new Date()): { from: string; to: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  return { from: `${pad(y, 4)}-${pad(m + 1)}-01`, to: `${pad(y, 4)}-${pad(m + 1)}-${pad(last)}` };
}

/** «23 أكتوبر 2026» */
export function formatGregorian(iso: string | null | undefined): string {
  if (!isValidISODate(iso)) return iso ?? '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${GREGORIAN_MONTHS[m - 1]} ${y}`;
}

// ---------- الهجري (خوارزمية جدولية) ----------

export interface HijriDate {
  year: number;
  month: number; // 1..12
  day: number;
}

function gregorianToJulianDay(y: number, m: number, d: number): number {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}

/** الخوارزمية الجدولية «المدنية» (epoch = 1948439.5 → اليوم 1948440 بعد التقريب). */
export function gregorianToHijri(iso: string): HijriDate | null {
  if (!isValidISODate(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const jd = gregorianToJulianDay(y, m, d);
  const l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const l2 = l - 10631 * n + 354;
  const j =
    Math.floor((10985 - l2) / 5316) * Math.floor((50 * l2) / 17719) +
    Math.floor(l2 / 5670) * Math.floor((43 * l2) / 15238);
  const l3 =
    l2 -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
    29;
  const month = Math.floor((24 * l3) / 709);
  const day = l3 - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;
  return { year, month, day };
}

export function formatHijri(h: HijriDate | null): string {
  if (!h) return '';
  return `${h.day} ${HIJRI_MONTHS[h.month - 1]} ${h.year} هـ`;
}

export function hijriFromISO(iso: string): string {
  return formatHijri(gregorianToHijri(iso));
}

/**
 * يفسّر تاريخًا مكتوبًا بصيغ شائعة إلى ISO: 2026-10-23، 23/10/2026، 23-10-2026، 2026/10/23.
 * يعيد null عند الفشل.
 */
export function parseFlexibleDate(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  if (!s) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) {
    const iso = `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
    return isValidISODate(iso) ? iso : null;
  }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) {
    const iso = `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`; // يوم/شهر/سنة
    return isValidISODate(iso) ? iso : null;
  }
  return null;
}
