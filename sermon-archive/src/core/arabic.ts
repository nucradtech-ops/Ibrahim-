/**
 * أدوات معالجة النص العربي للبحث: إزالة التشكيل وتوحيد الحروف المتشابهة
 * حتى يجد المستخدم «الصلاة» عند البحث عن «الصَّلاةُ» أو «الصلاه».
 */

const TASHKEEL = /[ً-ٰٟۖ-ۭـ]/g; // حركات + تطويل + علامات قرآنية صغيرة
const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿]/g;

const EASTERN_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

/** يحوّل النص إلى صيغة موحّدة للبحث (لا تُستخدم للعرض). */
export function normalizeArabic(input: string | null | undefined): string {
  if (!input) return '';
  let s = String(input);
  s = s.replace(INVISIBLE, '');
  s = s.replace(TASHKEEL, '');
  s = s.replace(/[أإآٱ]/g, 'ا');
  s = s.replace(/ى/g, 'ي');
  s = s.replace(/ئ/g, 'ي');
  s = s.replace(/ؤ/g, 'و');
  s = s.replace(/ة/g, 'ه');
  s = s.replace(/[٠-٩۰-۹]/g, (d) => EASTERN_DIGITS[d] ?? d);
  s = s.toLowerCase();
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** يقسم عبارة البحث إلى كلمات موحّدة. */
export function searchTerms(query: string): string[] {
  const n = normalizeArabic(query);
  if (!n) return [];
  return n.split(' ').filter(Boolean);
}

/** يهرّب محارف LIKE الخاصة ( % _ \ ). استخدمه مع ESCAPE '\\'. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => '\\' + c);
}

// ---------- مقتطف النتيجة ----------

const DIACRITICS_CLASS = '[\\u064B-\\u065F\\u0670\\u0640]*';
const CHAR_CLASSES: Record<string, string> = {
  'ا': '[اأإآٱ]',
  'ي': '[يىئ]',
  'ه': '[هة]',
  'و': '[وؤ]',
};

function regexForTerm(term: string): string {
  const parts: string[] = [];
  for (const ch of term) {
    if (ch === ' ') {
      parts.push('\\s+');
      continue;
    }
    const cls = CHAR_CLASSES[ch];
    if (cls) parts.push(cls);
    else parts.push(ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  }
  return parts.join(DIACRITICS_CLASS) + DIACRITICS_CLASS;
}

export interface Snippet {
  before: string;
  match: string;
  after: string;
}

/**
 * يستخرج مقتطفًا من النص الأصلي حول أول كلمة بحث موجودة، مع تجاهل التشكيل.
 * يعيد null إذا لم تُوجد أي كلمة في النص.
 */
export function makeSnippet(text: string | null | undefined, terms: string[], radius = 45): Snippet | null {
  if (!text || terms.length === 0) return null;
  let best: { index: number; length: number } | null = null;
  for (const term of terms) {
    if (!term || /^\d+$/.test(term)) continue; // الأرقام تُطابق الرقم المسلسل غالبًا لا النص
    let re: RegExp;
    try {
      re = new RegExp(regexForTerm(term));
    } catch {
      continue;
    }
    const m = re.exec(text);
    if (m && (best === null || m.index < best.index)) {
      best = { index: m.index, length: m[0].length };
    }
  }
  if (!best) return null;
  const start = Math.max(0, best.index - radius);
  const end = Math.min(text.length, best.index + best.length + radius);
  const clean = (s: string) => s.replace(/\s+/g, ' ');
  return {
    before: (start > 0 ? '… ' : '') + clean(text.slice(start, best.index)),
    match: clean(text.slice(best.index, best.index + best.length)),
    after: clean(text.slice(best.index + best.length, end)) + (end < text.length ? ' …' : ''),
  };
}
