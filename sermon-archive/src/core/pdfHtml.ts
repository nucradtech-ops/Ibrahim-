import { APP_NAME } from './backup';
import { formatGregorian } from './dates';
import type { Counted } from './repo';
import type { Sermon } from './types';

export const esc = (s: string | null | undefined) =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const paragraphs = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => (l.trim() ? `<p>${esc(l)}</p>` : ''))
    .join('');

function css(fontBase64?: string) {
  const face = fontBase64
    ? `@font-face{font-family:'ArchiveFont';src:url(data:font/ttf;base64,${fontBase64}) format('truetype');font-weight:400 700;}`
    : '';
  return `
  ${face}
  @page{margin:18mm 14mm;}
  *{box-sizing:border-box}
  body{direction:rtl;text-align:right;font-family:'ArchiveFont','Noto Naskh Arabic','Droid Arabic Naskh','Noto Sans Arabic','Traditional Arabic',serif;color:#1c1c1c;font-size:15px;line-height:1.95;margin:0}
  .brand{border-bottom:3px double #B8924A;padding-bottom:6px;margin-bottom:14px;color:#0F4D3A;font-weight:700;font-size:13px;display:flex;justify-content:space-between}
  h1{color:#0F4D3A;font-size:24px;margin:6px 0 10px}
  h2{color:#0F4D3A;font-size:18px;margin:18px 0 6px}
  table{width:100%;border-collapse:collapse;margin:8px 0 14px;font-size:13px}
  td,th{border:1px solid #d8d2c0;padding:5px 8px;text-align:right}
  th{background:#EEF3EF;color:#0F4D3A}
  .meta td:first-child{width:28%;background:#F7F3E8;color:#6b5a2e;font-weight:700}
  .body p{margin:0 0 8px;text-align:justify}
  .notes{background:#F7F3E8;border-right:4px solid #B8924A;padding:6px 10px;margin-top:14px;font-size:13px}
  .sermon{page-break-after:always}
  .sermon:last-child{page-break-after:auto}
  .foot{margin-top:18px;border-top:1px solid #ddd;padding-top:6px;color:#888;font-size:11px;text-align:center}
  `;
}

function sermonBlock(s: Sermon): string {
  const rows: [string, string][] = [
    ['الرقم المسلسل', String(s.serial)],
    ['التاريخ الميلادي', formatGregorian(s.sermon_date)],
    ...(s.hijri_date ? ([['التاريخ الهجري', s.hijri_date]] as [string, string][]) : []),
    ['المسجد', s.mosque_name ?? '—'],
    ['رقم الخطبة', s.sermon_number ?? '—'],
    ...(s.category ? ([['التصنيف', s.category]] as [string, string][]) : []),
  ];
  return `<section class="sermon">
    <div class="brand"><span>${esc(APP_NAME)}</span><span>خطبة رقم ${s.serial}</span></div>
    <h1>${esc(s.title)}</h1>
    <table class="meta">${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
    <div class="body">${paragraphs(s.body)}</div>
    ${s.notes ? `<div class="notes"><b>ملاحظات:</b> ${esc(s.notes)}</div>` : ''}
    <div class="foot">${esc(APP_NAME)}</div>
  </section>`;
}

export function sermonsHtml(sermons: Sermon[], fontBase64?: string): string {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${css(fontBase64)}</style></head><body>${sermons.map(sermonBlock).join('')}</body></html>`;
}

export interface ReportData {
  title: string;
  periodLabel: string;
  total: number;
  byYear: Counted[];
  byMosque: Counted[];
  byCategory: Counted[];
}

const countTable = (title: string, rows: Counted[], head: string) =>
  `<h2>${esc(title)}</h2><table><tr><th>${esc(head)}</th><th style="width:20%">العدد</th></tr>${
    rows.length ? rows.map((r) => `<tr><td>${esc(r.label)}</td><td>${r.count}</td></tr>`).join('') : '<tr><td colspan="2">لا بيانات</td></tr>'
  }</table>`;

export function reportHtml(r: ReportData, fontBase64?: string): string {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${css(fontBase64)}</style></head><body>
  <div class="brand"><span>${esc(APP_NAME)}</span><span>تقرير</span></div>
  <h1>${esc(r.title)}</h1>
  <table class="meta"><tr><td>الفترة</td><td>${esc(r.periodLabel)}</td></tr><tr><td>إجمالي الخطب</td><td>${r.total}</td></tr><tr><td>تاريخ التقرير</td><td>${esc(formatGregorian(new Date().toISOString().slice(0, 10)))}</td></tr></table>
  ${countTable('الخطب حسب السنة', r.byYear, 'السنة')}
  ${countTable('الخطب حسب المسجد', r.byMosque, 'المسجد')}
  ${countTable('الخطب حسب التصنيف', r.byCategory, 'التصنيف')}
  <div class="foot">${esc(APP_NAME)}</div></body></html>`;
}
