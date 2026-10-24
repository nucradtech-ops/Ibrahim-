import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { formatGregorian } from '../../core/dates';
import { reportHtml } from '../../core/pdfHtml';
import * as repo from '../../core/repo';
import { aoaToXlsxBase64 } from '../../core/tabular';
import { MIME, safeName, shareFile, sharePdf, stamp } from '../../platform/files';
import { useApp } from '../../state/app';
import { Button, Header, Screen, T } from '../../ui/components';
import { Bars } from '../../ui/Bars';
import { DateField } from '../../ui/DateField';
import { colors } from '../../ui/theme';

type Rep = Awaited<ReturnType<typeof repo.getPeriodReport>>;

export default function Reports() {
  const { db, toast, dataVersion } = useApp();
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [rep, setRep] = useState<Rep | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      repo.getPeriodReport(db, { dateFrom: from, dateTo: to }).then(setRep);
    }, [db, from, to, dataVersion]),
  );

  const period = from || to ? `${from ? formatGregorian(from) : 'البداية'} ← ${to ? formatGregorian(to) : 'اليوم'}` : 'كل الفترات';

  const data = () => ({ title: 'تقرير أرشيف الخطب', periodLabel: period, total: rep!.total, byYear: rep!.byYear, byMosque: rep!.byMosque, byCategory: rep!.byCategory });

  const pdf = async () => {
    if (!rep) return;
    setBusy(true);
    try {
      await sharePdf(`${safeName('تقرير أرشيف الخطب')} ${stamp()}.pdf`, (f) => reportHtml(data(), f));
    } catch (e: any) {
      toast(`تعذّر إنشاء PDF: ${e?.message ?? ''}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const xlsx = async () => {
    if (!rep) return;
    setBusy(true);
    try {
      const rows: (string | number)[][] = [
        ['أرشيف الخطب — تقرير'], ['الفترة', period], ['إجمالي الخطب', rep.total], [],
        ['السنة', 'العدد'], ...rep.byYear.map((r) => [r.label, r.count]), [],
        ['المسجد', 'العدد'], ...rep.byMosque.map((r) => [r.label, r.count]), [],
        ['التصنيف', 'العدد'], ...rep.byCategory.map((r) => [r.label, r.count]),
      ];
      await shareFile(`${safeName('تقرير أرشيف الخطب')} ${stamp()}.xlsx`, MIME.xlsx, { base64: aoaToXlsxBase64(rows, 'التقرير') });
    } catch (e: any) {
      toast(`تعذّر إنشاء Excel: ${e?.message ?? ''}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header title="التقارير والإحصائيات" subtitle={period} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <DateField label="من تاريخ" value={from} onChange={setFrom} clearable />
          <DateField label="إلى تاريخ" value={to} onChange={setTo} clearable />
        </View>
        <View style={{ backgroundColor: colors.green, borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 12 }}>
          <T style={{ color: colors.goldSoft, textAlign: 'center' }}>إجمالي الخطب في الفترة</T>
          <T bold size={34} style={{ color: '#fff', textAlign: 'center' }}>{rep?.total ?? '…'}</T>
        </View>
        {rep && (
          <>
            <Bars title="الخطب حسب السنة" rows={rep.byYear} />
            <Bars title="الخطب حسب المسجد" rows={rep.byMosque} />
            <Bars title="الخطب حسب التصنيف" rows={rep.byCategory} />
          </>
        )}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button kind="secondary" label="تصدير التقرير PDF" loading={busy} disabled={!rep || rep.total === 0} style={{ flex: 1 }} onPress={pdf} />
          <Button kind="secondary" label="تصدير Excel" disabled={!rep || rep.total === 0 || busy} style={{ flex: 1 }} onPress={xlsx} />
        </View>
      </ScrollView>
    </Screen>
  );
}
