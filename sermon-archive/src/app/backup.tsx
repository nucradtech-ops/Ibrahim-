import { Directory, File, Paths } from 'expo-file-system';
import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { createBackup, restoreBackup, verifyBackup, BackupFile } from '../core/backup';
import { formatGregorian } from '../core/dates';
import { applyImport, markDuplicates } from '../core/importer';
import { sermonsHtml } from '../core/pdfHtml';
import * as repo from '../core/repo';
import { ImportRow, parseCsvText, parseXlsxBase64, sermonsToCsv, sermonsToXlsxBase64 } from '../core/tabular';
import { MIME, pickFile, readBase64, readText, safeName, saveToChosenFolder, shareFile, sharePdf, stamp } from '../platform/files';
import { useApp } from '../state/app';
import { Button, Card, Chip, Header, Modal2, Screen, T } from '../ui/components';
import { colors } from '../ui/theme';

function safetyDir() {
  const d = new Directory(Paths.document, 'safety-backups');
  if (!d.exists) d.create({ intermediates: true });
  return d;
}

export default function BackupScreen() {
  const { db, toast, bumpData, fontScale } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [counts, setCounts] = useState({ s: 0, m: 0 });
  const [years, setYears] = useState<number[]>([]);
  const [exportYear, setExportYear] = useState<number | null>(null);

  const [restorePlan, setRestorePlan] = useState<{ backup: BackupFile; name: string } | null>(null);
  const [restoreErrors, setRestoreErrors] = useState<string[] | null>(null);
  const [importPlan, setImportPlan] = useState<{ rows: ImportRow[]; name: string } | null>(null);
  const [includeDup, setIncludeDup] = useState(false);

  const refresh = async () => {
    const st = await repo.getStats(db, { from: '0000-01-01', to: '0000-01-01' });
    setCounts({ s: st.totalSermons, m: st.totalMosques });
    setYears(await repo.listYears(db));
    const r = await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = 'last_backup'");
    setLastBackup(r?.value ?? null);
  };
  useEffect(() => { refresh(); }, [db]);

  const guard = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e: any) {
      toast(`${e?.message ?? 'حدث خطأ غير متوقع'}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const markBackupTime = async () => {
    await db.runAsync("INSERT INTO meta (key, value) VALUES ('last_backup', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [new Date().toISOString()]);
    refresh();
  };

  const backupJson = async () => JSON.stringify(await createBackup(db, { font_scale: String(fontScale) }));

  const backupToFolder = () => guard('folder', async () => {
    const name = `أرشيف-الخطب-نسخة-${stamp()}.json`;
    const ok = await saveToChosenFolder(name, MIME.json, { text: await backupJson() });
    if (ok) { await markBackupTime(); toast('تم حفظ النسخة الاحتياطية في المجلد الذي اخترته'); }
  });

  const backupShare = () => guard('share', async () => {
    await shareFile(`أرشيف-الخطب-نسخة-${stamp()}.json`, MIME.json, { text: await backupJson() });
    await markBackupTime();
  });

  const pickBackup = () => guard('pick', async () => {
    const f = await pickFile(['application/json', 'text/plain', '*/*']);
    if (!f) return;
    const check = verifyBackup(await readText(f.uri));
    if (!check.ok) { setRestoreErrors(check.errors); return; }
    setRestorePlan({ backup: check.backup!, name: f.name });
  });

  const doRestore = () => guard('restore', async () => {
    const plan = restorePlan!;
    // نسخة أمان من البيانات الحالية قبل أي استبدال
    let safetyName: string | null = null;
    if (counts.s > 0 || counts.m > 0) {
      safetyName = `قبل-الاستعادة-${stamp()}.json`;
      const f = new File(safetyDir(), safetyName);
      f.create({ overwrite: true });
      f.write(await backupJson());
    }
    const r = await restoreBackup(db, plan.backup);
    const fs = plan.backup.data.settings?.font_scale;
    if (fs) await db.runAsync("INSERT INTO meta (key, value) VALUES ('font_scale', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [fs]);
    setRestorePlan(null);
    bumpData();
    refresh();
    toast(`تمت الاستعادة: ${r.sermons} خطبة و${r.mosques} مسجد${safetyName ? ' (حُفظت نسخة من بياناتك السابقة)' : ''}`);
  });

  const exportFilters = () => ({ year: exportYear, sort: 'serial_asc' as const });
  const nothing = counts.s === 0;

  const exportPdf = () => guard('pdf', async () => {
    const all = await repo.getAllSermonsFull(db, exportFilters());
    if (!all.length) return toast('لا توجد خطب للتصدير', 'error');
    await sharePdf(`أرشيف-الخطب-${exportYear ?? 'الكل'}-${stamp()}.pdf`, (f) => sermonsHtml(all, f));
  });
  const exportXlsx = () => guard('xlsx', async () => {
    const all = await repo.getAllSermonsFull(db, exportFilters());
    if (!all.length) return toast('لا توجد خطب للتصدير', 'error');
    await shareFile(`أرشيف-الخطب-${exportYear ?? 'الكل'}-${stamp()}.xlsx`, MIME.xlsx, { base64: sermonsToXlsxBase64(all) });
  });
  const exportCsv = () => guard('csv', async () => {
    const all = await repo.getAllSermonsFull(db, exportFilters());
    if (!all.length) return toast('لا توجد خطب للتصدير', 'error');
    await shareFile(`أرشيف-الخطب-${exportYear ?? 'الكل'}-${stamp()}.csv`, MIME.csv, { text: sermonsToCsv(all) });
  });

  const pickImport = () => guard('import-pick', async () => {
    const f = await pickFile([MIME.xlsx, 'text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'text/plain', '*/*']);
    if (!f) return;
    const isCsv = /\.(csv|txt)$/i.test(f.name);
    const parsed = isCsv ? parseCsvText(await readText(f.uri)) : parseXlsxBase64(await readBase64(f.uri));
    if (parsed.error) return toast(parsed.error, 'error');
    if (!parsed.rows.length) return toast('لا توجد صفوف في الملف', 'error');
    setIncludeDup(false);
    setImportPlan({ rows: await markDuplicates(db, parsed.rows), name: f.name });
  });

  const doImport = () => guard('import', async () => {
    const r = await applyImport(db, importPlan!.rows, { includeDuplicates: includeDup });
    setImportPlan(null);
    bumpData();
    refresh();
    toast(`تم استيراد ${r.added} خطبة${r.skippedDuplicates ? ` • تخطي ${r.skippedDuplicates} مكررة` : ''}${r.skippedInvalid ? ` • ${r.skippedInvalid} غير صالحة` : ''}`);
  });

  const nNew = importPlan?.rows.filter((r) => r.status === 'new').length ?? 0;
  const nDup = importPlan?.rows.filter((r) => r.status === 'duplicate').length ?? 0;
  const nBad = importPlan?.rows.filter((r) => r.status === 'invalid').length ?? 0;

  return (
    <Screen>
      <Header title="النسخ الاحتياطي والتصدير" subtitle={`${counts.s} خطبة • ${counts.m} مسجد`} back />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 50 }}>
        <Card style={{ marginBottom: 14 }}>
          <T bold size={16}>نسخة احتياطية</T>
          <T muted size={13.5} style={{ marginVertical: 6 }}>
            {lastBackup ? `آخر نسخة: ${formatGregorian(lastBackup.slice(0, 10))}` : 'لم تُنشأ نسخة احتياطية بعد.'} الملف بصيغة JSON ويحتوي كل الخطب والمساجد والتصنيفات.
          </T>
          <Button label="حفظ النسخة في مجلد أختاره" loading={busy === 'folder'} onPress={backupToFolder} />
          <Button kind="secondary" label="مشاركة النسخة (واتساب، بريد، سحابة…)" loading={busy === 'share'} onPress={backupShare} style={{ marginTop: 8 }} />
        </Card>

        <Card style={{ marginBottom: 14 }}>
          <T bold size={16}>استعادة من نسخة</T>
          <T muted size={13.5} style={{ marginVertical: 6 }}>يُتحقق من سلامة الملف أولًا، وتُحفظ نسخة من بياناتك الحالية تلقائيًا قبل الاستبدال.</T>
          <Button kind="secondary" label="اختيار ملف نسخة احتياطية" loading={busy === 'pick'} onPress={pickBackup} />
        </Card>

        <Card style={{ marginBottom: 14 }}>
          <T bold size={16}>تصدير الخطب</T>
          <T muted size={13.5} style={{ marginVertical: 6 }}>اختر السنة (أو الكل). تصدير PDF لعدد كبير جدًا من الخطب قد يستغرق وقتًا؛ يُفضَّل تقسيمه حسب السنة.</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Chip label="كل السنوات" selected={exportYear === null} onPress={() => setExportYear(null)} />
            {years.map((y) => <Chip key={y} label={String(y)} selected={exportYear === y} onPress={() => setExportYear(y)} />)}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button kind="secondary" label="PDF" disabled={nothing} loading={busy === 'pdf'} style={{ flex: 1 }} onPress={exportPdf} />
            <Button kind="secondary" label="Excel" disabled={nothing} loading={busy === 'xlsx'} style={{ flex: 1 }} onPress={exportXlsx} />
            <Button kind="secondary" label="CSV" disabled={nothing} loading={busy === 'csv'} style={{ flex: 1 }} onPress={exportCsv} />
          </View>
        </Card>

        <Card>
          <T bold size={16}>استيراد من Excel أو CSV</T>
          <T muted size={13.5} style={{ marginVertical: 6 }}>الأعمدة المطلوبة: موضوع الخطبة، التاريخ، نص الخطبة. اختيارية: اسم المسجد، رقم الخطبة، التصنيف، ملاحظات. تُعرض معاينة قبل الإضافة، ولا يُستبدل شيء من بياناتك.</T>
          <Button kind="secondary" label="اختيار ملف للاستيراد" loading={busy === 'import-pick'} onPress={pickImport} />
        </Card>
      </ScrollView>

      <Modal2 visible={!!restorePlan} onClose={() => setRestorePlan(null)}>
        {restorePlan && (
          <>
            <T bold size={17}>تأكيد الاستعادة</T>
            <T style={{ marginTop: 8 }}>الملف: {restorePlan.name}</T>
            <T muted>تاريخ النسخة: {formatGregorian(restorePlan.backup.created_at.slice(0, 10))}</T>
            <T muted>يحتوي: {restorePlan.backup.counts.sermons} خطبة و{restorePlan.backup.counts.mosques} مسجد</T>
            <View style={{ backgroundColor: colors.dangerSoft, borderRadius: 10, padding: 10, marginVertical: 12 }}>
              <T style={{ color: colors.danger }} bold>تنبيه</T>
              <T size={13.5}>ستُستبدل بيانات التطبيق الحالية ({counts.s} خطبة و{counts.m} مسجد) بمحتوى النسخة. سنحفظ نسخة أمان من بياناتك الحالية قبل الاستبدال.</T>
            </View>
            <Button kind="danger" label="استبدال البيانات الحالية بالنسخة" loading={busy === 'restore'} onPress={doRestore} />
            <Button kind="ghost" label="إلغاء" onPress={() => setRestorePlan(null)} style={{ marginTop: 8 }} />
          </>
        )}
      </Modal2>

      <Modal2 visible={!!restoreErrors} onClose={() => setRestoreErrors(null)}>
        <T bold size={17} style={{ color: colors.danger }}>لا يمكن استعادة هذا الملف</T>
        <ScrollView style={{ maxHeight: 280, marginVertical: 10 }}>
          {restoreErrors?.map((e, i) => <T key={i} style={{ marginBottom: 4 }}>• {e}</T>)}
        </ScrollView>
        <T muted size={13}>لم يتغير شيء في بياناتك.</T>
        <Button label="حسنًا" onPress={() => setRestoreErrors(null)} style={{ marginTop: 10 }} />
      </Modal2>

      <Modal2 visible={!!importPlan} onClose={() => setImportPlan(null)}>
        {importPlan && (
          <>
            <T bold size={17}>معاينة الاستيراد</T>
            <T muted>{importPlan.name}</T>
            <View style={{ flexDirection: 'row', gap: 8, marginVertical: 10 }}>
              <Card style={{ flex: 1, padding: 8 }}><T bold style={{ textAlign: 'center', color: colors.success }}>{nNew}</T><T size={12} muted style={{ textAlign: 'center' }}>جديدة</T></Card>
              <Card style={{ flex: 1, padding: 8 }}><T bold style={{ textAlign: 'center', color: colors.gold }}>{nDup}</T><T size={12} muted style={{ textAlign: 'center' }}>مكررة</T></Card>
              <Card style={{ flex: 1, padding: 8 }}><T bold style={{ textAlign: 'center', color: colors.danger }}>{nBad}</T><T size={12} muted style={{ textAlign: 'center' }}>غير صالحة</T></Card>
            </View>
            <ScrollView style={{ maxHeight: 230 }}>
              {importPlan.rows.slice(0, 40).map((r) => (
                <View key={r.line} style={{ paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <T size={13.5} numberOfLines={1}>سطر {r.line}: {r.input.title || '(بدون موضوع)'}</T>
                  <T size={12} style={{ color: r.status === 'new' ? colors.success : r.status === 'duplicate' ? colors.gold : colors.danger }}>
                    {r.status === 'new' ? 'ستُضاف' : r.problems.join('، ')}
                  </T>
                </View>
              ))}
              {importPlan.rows.length > 40 && <T muted size={12} style={{ marginTop: 6 }}>… و{importPlan.rows.length - 40} صفوف أخرى</T>}
            </ScrollView>
            {nDup > 0 && <Chip label={includeDup ? '✓ إضافة المكررة أيضًا' : 'تخطي المكررة (الافتراضي)'} selected={includeDup} onPress={() => setIncludeDup((v) => !v)} />}
            <Button label={`استيراد ${nNew + (includeDup ? nDup : 0)} خطبة`} disabled={nNew + (includeDup ? nDup : 0) === 0} loading={busy === 'import'} onPress={doImport} />
            <Button kind="ghost" label="إلغاء" onPress={() => setImportPlan(null)} style={{ marginTop: 8 }} />
          </>
        )}
      </Modal2>
    </Screen>
  );
}
