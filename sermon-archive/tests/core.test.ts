import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { makeSnippet, normalizeArabic } from '../src/core/arabic';
import { createBackup, restoreBackup, verifyBackup } from '../src/core/backup';
import { gregorianToHijri, hijriFromISO, monthRange, parseFlexibleDate } from '../src/core/dates';
import { applyImport, markDuplicates } from '../src/core/importer';
import * as repo from '../src/core/repo';
import { migrate } from '../src/core/schema';
import { parseCsvText, parseXlsxBase64, sermonsToCsv, sermonsToXlsxBase64 } from '../src/core/tabular';
import { NO_MOSQUE } from '../src/core/types';
import { freshDb, makeDb } from './helpers';

const longArabic = ('الحمد لله رب العالمين، والصلاة والسلام على أشرف المرسلين. أما بعد: فاتقوا الله عباد الله. ').repeat(2000);

const base = (o: Partial<Parameters<typeof repo.addSermon>[1]> = {}) => ({
  title: 'فضل الصلاة', sermon_date: '2026-10-23', body: 'نص الخطبة عن الصلاة', ...o,
});

test('تطبيع النص العربي يتجاهل التشكيل والهمزات', () => {
  assert.equal(normalizeArabic('الصَّلاةُ'), normalizeArabic('الصلاه'));
  assert.equal(normalizeArabic('أحمد'), normalizeArabic('احمد'));
  assert.equal(normalizeArabic('٢٠٢٦'), '2026');
});

test('هجرة قاعدة البيانات idempotent وتحفظ البيانات', async () => {
  const db = await freshDb();
  await repo.addSermon(db, base());
  await migrate(db);
  await migrate(db);
  assert.equal((await repo.searchSermons(db)).total, 1);
  const v = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  assert.equal(v!.user_version, 1);
});

test('إضافة خطبة: رقم مسلسل تلقائي فريد ولا يُعاد استخدامه بعد الحذف', async () => {
  const db = await freshDb();
  const a = await repo.addSermon(db, base({ title: 'أ' }));
  const b = await repo.addSermon(db, base({ title: 'ب' }));
  const c = await repo.addSermon(db, base({ title: 'ج' }));
  assert.deepEqual([a.serial, b.serial, c.serial], [1, 2, 3]);
  await repo.deleteSermon(db, c.id);
  const d = await repo.addSermon(db, base({ title: 'د' }));
  assert.equal(d.serial, 4);
  // الفهرس الفريد يمنع التكرار حتى عند الإدخال المباشر
  await assert.rejects(() =>
    db.runAsync(
      `INSERT INTO sermons (serial,title,title_norm,sermon_date,body,body_norm,year,created_at,updated_at) VALUES (1,'x','x','2026-01-01','b','b',2026,'t','t')`,
    ),
  );
});

test('رقم الخطبة مستقل عن الرقم المسلسل ويمكن تكراره', async () => {
  const db = await freshDb();
  const a = await repo.addSermon(db, base({ sermon_number: '12' }));
  const b = await repo.addSermon(db, base({ title: 'ثانية', sermon_number: '12' }));
  assert.equal(a.sermon_number, '12');
  assert.equal(b.sermon_number, '12');
  assert.notEqual(a.serial, b.serial);
});

test('التحقق من الحقول الأساسية', async () => {
  const db = await freshDb();
  await assert.rejects(() => repo.addSermon(db, base({ title: '  ' })), /موضوع/);
  await assert.rejects(() => repo.addSermon(db, base({ sermon_date: '' })), /تاريخ/);
  await assert.rejects(() => repo.addSermon(db, base({ sermon_date: '2026-02-31' })), /تاريخ/);
  await assert.rejects(() => repo.addSermon(db, base({ body: '' })), /نص/);
  const ok = await repo.addSermon(db, base({ notes: '', category: '' }));
  assert.equal(ok.notes, null);
  assert.equal(ok.category, null);
  assert.equal((await repo.searchSermons(db)).total, 1);
});

test('تعديل الخطبة يحفظ التغييرات ويحدّث التاريخ دون تغيير الرقم المسلسل', async () => {
  const db = await freshDb();
  const a = await repo.addSermon(db, base());
  const u = await repo.updateSermon(db, a.id, { ...base({ title: 'عنوان جديد', sermon_date: '2025-03-01', body: 'نص جديد' }) });
  assert.equal(u.title, 'عنوان جديد');
  assert.equal(u.year, 2025);
  assert.equal(u.serial, a.serial);
  assert.ok(u.updated_at >= a.updated_at);
});

test('الحذف', async () => {
  const db = await freshDb();
  const a = await repo.addSermon(db, base());
  await repo.deleteSermon(db, a.id);
  assert.equal(await repo.getSermon(db, a.id), null);
});

test('البحث في نص الخطبة الكامل وفي الحقول الأخرى', async () => {
  const db = await freshDb();
  const m = await repo.addMosque(db, 'مسجد الرحمن');
  await repo.addSermon(db, base({ title: 'الصبر', body: 'إنما يوفى الصابرون أجرهم بغير حساب', mosque_id: m.id, notes: 'ملاحظة خاصة', sermon_number: '7' }));
  await repo.addSermon(db, base({ title: 'الصدق', body: 'عليكم بالصدق فإن الصدق يهدي إلى البر' }));
  const q = async (query: string) => (await repo.searchSermons(db, { query })).items.map((i) => i.title);
  assert.deepEqual(await q('الصابرون'), ['الصبر']); // داخل النص فقط
  assert.deepEqual(await q('يهدي'), ['الصدق']);
  assert.deepEqual(await q('الرحمن'), ['الصبر']); // اسم المسجد
  assert.deepEqual(await q('خاصة'), ['الصبر']); // الملاحظات
  assert.deepEqual(await q('الصَّدْق'), ['الصدق']); // تشكيل
  assert.equal((await q('2026-10')).length, 2); // التاريخ
  const bySerial = await repo.searchSermons(db, { query: '1' });
  assert.ok(bySerial.items.some((i) => i.serial === 1));
  assert.deepEqual(await q('7'), ['الصبر']); // رقم الخطبة
  assert.deepEqual(await q('بغير حساب'), ['الصبر']); // عدة كلمات
  assert.deepEqual(await q('بغير يهدي'), []); // AND
  assert.deepEqual(await q('100%'), []); // محارف LIKE الخاصة لا تطابق الكل
  assert.deepEqual(await q('_'), []);
});

test('التصفية: مسجد، تصنيف، سنة، فترة، وبدون مسجد', async () => {
  const db = await freshDb();
  const m1 = await repo.addMosque(db, 'م1');
  const m2 = await repo.addMosque(db, 'م2');
  await repo.addSermon(db, base({ title: 'a', sermon_date: '2024-01-10', mosque_id: m1.id, category: 'الأخلاق' }));
  await repo.addSermon(db, base({ title: 'b', sermon_date: '2025-05-10', mosque_id: m2.id, category: 'العقيدة' }));
  await repo.addSermon(db, base({ title: 'c', sermon_date: '2025-08-10', mosque_id: m2.id }));
  await repo.addSermon(db, base({ title: 'd', sermon_date: '2026-02-10' }));
  const t = async (f: any) => (await repo.searchSermons(db, { ...f, sort: 'serial_asc' })).items.map((i) => i.title).join('');
  assert.equal(await t({ mosqueId: m2.id }), 'bc');
  assert.equal(await t({ mosqueId: NO_MOSQUE }), 'd');
  assert.equal(await t({ category: 'العقيدة' }), 'b');
  assert.equal(await t({ year: 2025 }), 'bc');
  assert.equal(await t({ dateFrom: '2025-06-01', dateTo: '2026-12-31' }), 'cd');
  assert.equal(await t({ dateFrom: '2025-05-10', dateTo: '2025-05-10' }), 'b'); // الحدود شاملة
  assert.equal(await t({ year: 2025, mosqueId: m2.id, query: 'c' }), 'c');
  assert.deepEqual(await repo.listYears(db), [2026, 2025, 2024]);
});

test('الترتيب', async () => {
  const db = await freshDb();
  await repo.addSermon(db, base({ title: 'باء', sermon_date: '2025-01-01' }));
  await repo.addSermon(db, base({ title: 'ألف', sermon_date: '2026-01-01' }));
  const o = async (sort: any) => (await repo.searchSermons(db, { sort })).items.map((i) => i.title).join(',');
  assert.equal(await o('date_desc'), 'ألف,باء');
  assert.equal(await o('date_asc'), 'باء,ألف');
  assert.equal(await o('serial_asc'), 'باء,ألف');
  assert.equal(await o('serial_desc'), 'ألف,باء');
  assert.equal(await o('title_asc'), 'ألف,باء');
});

test('المساجد: منع التكرار، العدّ، والحذف الآمن دون فقدان خطب', async () => {
  const db = await freshDb();
  const a = await repo.addMosque(db, 'مسجد النور');
  await assert.rejects(() => repo.addMosque(db, 'مَسْجِد  النور'), /مسجّل مسبقًا/);
  const b = await repo.addMosque(db, 'مسجد الهدى');
  await repo.addSermon(db, base({ mosque_id: a.id }));
  await repo.addSermon(db, base({ title: 'ثانية', mosque_id: a.id }));
  assert.equal((await repo.getMosque(db, a.id))!.sermon_count, 2);
  assert.equal((await repo.listMosques(db, 'النور')).length, 1);
  await assert.rejects(() => repo.deleteMosque(db, a.id), /مرتبط/); // لا حذف دون اختيار
  assert.equal((await repo.searchSermons(db)).total, 2);
  await repo.deleteMosque(db, a.id, { mode: 'move', moveToId: b.id });
  assert.equal((await repo.getMosque(db, b.id))!.sermon_count, 2);
  await repo.deleteMosque(db, b.id, { mode: 'detach' });
  const all = await repo.searchSermons(db);
  assert.equal(all.total, 2); // الخطب باقية
  assert.ok(all.items.every((i) => i.mosque_id === null));
  await repo.updateMosque(db, (await repo.addMosque(db, 'جديد')).id, 'جديد معدّل', 'ملاحظة');
});

test('نص عربي طويل جدًا (~190 ألف حرف) يُحفظ ويُسترجع كاملًا ويُبحث فيه', async () => {
  const db = await freshDb();
  const text = longArabic + ' كلمة_فريدة_في_النهاية';
  const s = await repo.addSermon(db, base({ body: text }));
  const got = await repo.getSermon(db, s.id);
  assert.equal(got!.body.length, text.trim().length);
  assert.equal(got!.body, text.trim());
  const r = await repo.searchSermons(db, { query: 'كلمة_فريدة' }); // '_' محارف خاصة تُهرَّب
  assert.equal(r.total, 1);
});

test('الإحصائيات والتقارير', async () => {
  const db = await freshDb();
  const m = await repo.addMosque(db, 'م');
  const now = new Date();
  const { from } = monthRange(now);
  await repo.addSermon(db, base({ sermon_date: from, mosque_id: m.id, category: 'العقيدة' }));
  await repo.addSermon(db, base({ title: 'x', sermon_date: '2020-01-01' }));
  const st = await repo.getStats(db, monthRange(now));
  assert.equal(st.totalSermons, 2);
  assert.equal(st.totalMosques, 1);
  assert.equal(st.thisMonth, 1);
  assert.deepEqual(st.byYear.map((y) => y.label), [String(now.getFullYear()), '2020']);
  assert.deepEqual(st.byMosque.map((x) => `${x.label}:${x.count}`).sort(), ['بدون مسجد:1', 'م:1'].sort());
  const rep = await repo.getPeriodReport(db, { dateFrom: '2019-01-01', dateTo: '2020-12-31' });
  assert.equal(rep.total, 1);
  assert.equal(rep.byYear[0].label, '2020');
});

test('الهجري', () => {
  const h = gregorianToHijri('2024-03-11')!; // 1 رمضان 1445 (±1 يوم)
  assert.equal(h.year, 1445);
  assert.equal(h.month, 9);
  assert.ok(h.day >= 1 && h.day <= 2, `day=${h.day}`);
  assert.ok(hijriFromISO('2026-10-23').includes('هـ'));
  assert.equal(parseFlexibleDate('23/10/2026'), '2026-10-23');
  assert.equal(parseFlexibleDate('٢٠٢٦-١٠-٢٣'), '2026-10-23');
  assert.equal(parseFlexibleDate('2026-13-01'), null);
});

test('مقتطف البحث يتجاهل التشكيل ويعيد النص الأصلي', () => {
  const s = makeSnippet('إنَّ الصَّلاةَ كانت على المؤمنين كتابًا موقوتًا', ['الصلاه'], 10)!;
  assert.equal(s.match, 'الصَّلاةَ');
  assert.equal(makeSnippet('نص', ['غير'], 10), null);
});

test('النسخ الاحتياطي: إنشاء ثم استعادة في قاعدة جديدة بنفس البيانات والأرقام', async () => {
  const db = await freshDb();
  const m = await repo.addMosque(db, 'مسجد التقوى');
  await repo.addSermon(db, base({ title: 'الأولى', mosque_id: m.id, category: 'العقيدة', notes: 'ن' }));
  const s2 = await repo.addSermon(db, base({ title: 'الثانية', body: longArabic }));
  await repo.deleteSermon(db, s2.id);
  await repo.addSermon(db, base({ title: 'الثالثة' }));
  const bk = await createBackup(db, { fontScale: '1.2' });
  const check = verifyBackup(JSON.stringify(bk));
  assert.ok(check.ok, check.errors.join());

  const db2 = await freshDb();
  await repo.addSermon(db2, base({ title: 'ستُستبدل' }));
  await restoreBackup(db2, check.backup!);
  const all = await repo.getAllSermonsFull(db2, { sort: 'serial_asc' });
  assert.deepEqual(all.map((s) => [s.serial, s.title]), [[1, 'الأولى'], [3, 'الثالثة']]);
  assert.equal(all[0].mosque_name, 'مسجد التقوى');
  assert.equal((await repo.addSermon(db2, base({ title: 'تالية' }))).serial, 4);
  assert.equal((await repo.searchSermons(db2, { query: 'ستستبدل' })).total, 0);
  assert.equal((await repo.searchSermons(db2, { query: 'الثالثه' })).total, 1);
});

test('التحقق من النسخة: ملف تالف أو معدّل أو غريب يُرفض ولا يُستعاد', async () => {
  const db = await freshDb();
  await repo.addSermon(db, base());
  const bk = await createBackup(db);
  const text = JSON.stringify(bk);
  assert.equal(verifyBackup('ليس json').ok, false);
  assert.equal(verifyBackup('{"a":1}').ok, false);
  const tampered = text.replace('فضل الصلاة', 'عنوان مزوّر');
  const r = verifyBackup(tampered);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /بصمة/);
  const dup = JSON.parse(text);
  dup.data.sermons.push({ ...dup.data.sermons[0] });
  assert.equal(verifyBackup(JSON.stringify(dup)).ok, false);
});

test('فشل الاستعادة في منتصفها يُلغي كل شيء ويبقي البيانات الحالية', async () => {
  const db = await freshDb();
  await repo.addSermon(db, base({ title: 'يجب أن تبقى' }));
  const good = await createBackup(await (async () => { const d = await freshDb(); await repo.addSermon(d, base({ title: 'من النسخة' })); return d; })());
  const bad = JSON.parse(JSON.stringify(good));
  bad.data.sermons.push({ ...bad.data.sermons[0], title: 'مكرر', serial: bad.data.sermons[0].serial }); // يكسر الفهرس الفريد أثناء الإدخال
  await assert.rejects(() => restoreBackup(db, bad));
  const all = await repo.searchSermons(db);
  assert.equal(all.total, 1);
  assert.equal(all.items[0].title, 'يجب أن تبقى');
});

test('الاستمرارية: البيانات تبقى بعد إغلاق قاعدة البيانات الفعلية وإعادة فتحها', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sermons-'));
  const file = join(dir, 'app.db');
  try {
    const db1 = await freshDb(file);
    await repo.addSermon(db1, base({ title: 'باقية', body: longArabic }));
    db1.close();
    const db2 = makeDb(file);
    await migrate(db2); // كما يحدث عند كل تشغيل/تحديث للتطبيق
    const r = await repo.searchSermons(db2, { query: 'باقية' });
    assert.equal(r.total, 1);
    assert.equal((await repo.getSermon(db2, r.items[0].id))!.body, longArabic.trim());
    db2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('تصدير Excel وCSV ثم قراءتهما: المحتوى العربي سليم والنص الطويل لا يُقتطع', async () => {
  const db = await freshDb();
  const m = await repo.addMosque(db, 'مسجد "الفرقان"');
  await repo.addSermon(db, base({ title: 'عنوان, بفاصلة', mosque_id: m.id, category: 'الأسرة', notes: 'سطر1\nسطر2', sermon_number: '5' }));
  await repo.addSermon(db, base({ title: 'طويلة', body: longArabic, sermon_date: '2025-02-02' }));
  const all = await repo.getAllSermonsFull(db, { sort: 'serial_asc' });

  const x = parseXlsxBase64(sermonsToXlsxBase64(all));
  assert.equal(x.error, undefined);
  assert.equal(x.rows.length, 2);
  assert.equal(x.rows[0].input.title, 'عنوان, بفاصلة');
  assert.equal(x.rows[0].mosqueName, 'مسجد "الفرقان"');
  assert.equal(x.rows[0].input.notes, 'سطر1\nسطر2');
  assert.equal(x.rows[1].input.body, longArabic.trim()); // تقسيم الخلايا وإعادة التجميع
  assert.equal(x.rows[1].input.sermon_date, '2025-02-02');

  const c = parseCsvText(sermonsToCsv(all));
  assert.equal(c.rows.length, 2);
  assert.equal(c.rows[0].input.title, 'عنوان, بفاصلة');
  assert.equal(c.rows[1].input.body, longArabic.trim());
  assert.ok(sermonsToCsv(all).startsWith('﻿'));
});

test('الاستيراد: معاينة، اكتشاف التكرار، ولا استبدال للبيانات الموجودة', async () => {
  const src = await freshDb();
  await repo.addSermon(src, base({ title: 'الأولى', body: 'نص أول' }));
  await repo.addSermon(src, base({ title: 'الثانية', body: 'نص ثان', sermon_date: '2025-01-01' }));
  const file = sermonsToCsv(await repo.getAllSermonsFull(src, { sort: 'serial_asc' }));

  const dst = await freshDb();
  await repo.addSermon(dst, base({ title: 'الأولى', body: 'نص أول' })); // مكررة
  const parsed = parseCsvText(file);
  const rows = await markDuplicates(dst, parsed.rows);
  assert.deepEqual(rows.map((r) => r.status), ['duplicate', 'new']);
  const res = await applyImport(dst, rows);
  assert.deepEqual(res, { added: 1, skippedDuplicates: 1, skippedInvalid: 0 });
  const all = await repo.getAllSermonsFull(dst, { sort: 'serial_asc' });
  assert.equal(all.length, 2);
  assert.equal(new Set(all.map((s) => s.serial)).size, 2);
});

test('الاستيراد يرفض الصفوف غير الصالحة ويقبل أسماء أعمدة بديلة', async () => {
  const bad = parseCsvText('الموضوع,التاريخ,النص\r\nأ,2026-01-01,نص\r\n,2026-01-01,نص\r\nب,غير تاريخ,نص\r\n');
  assert.deepEqual(bad.rows.map((r) => r.status), ['new', 'invalid', 'invalid']);
  assert.equal(parseCsvText('a,b\r\n1,2').error?.includes('الأعمدة'), true);
  const db = await freshDb();
  const res = await applyImport(db, await markDuplicates(db, bad.rows));
  assert.equal(res.added, 1);
  assert.equal(res.skippedInvalid, 2);
});
