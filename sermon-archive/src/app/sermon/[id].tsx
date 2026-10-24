import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, Share, View } from 'react-native';
import { APP_NAME } from '../../core/backup';
import { formatGregorian } from '../../core/dates';
import { sermonsHtml } from '../../core/pdfHtml';
import * as repo from '../../core/repo';
import type { Sermon } from '../../core/types';
import { printHtml, safeName, sharePdf } from '../../platform/files';
import { useApp } from '../../state/app';
import { Button, Header, Modal2, Screen, T } from '../../ui/components';
import { SermonReader } from '../../ui/Reader';

export const sermonPlainText = (s: Sermon) =>
  [
    s.title,
    `${formatGregorian(s.sermon_date)}${s.hijri_date ? ' — ' + s.hijri_date : ''}`,
    `${s.mosque_name ?? ''}${s.sermon_number ? ' — خطبة رقم ' + s.sermon_number : ''}`.replace(/^ — /, ''),
    '',
    s.body,
    s.notes ? `\nملاحظات: ${s.notes}` : '',
    `\n— ${APP_NAME}`,
  ]
    .filter((l, i) => l !== '' || i === 3)
    .join('\n');

export default function SermonDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, toast, bumpData } = useApp();
  const [s, setS] = useState<Sermon | null | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      repo.getSermon(db, Number(id)).then(setS);
    }, [db, id]),
  );

  if (s === undefined) return <Screen><Header title="الخطبة" back /></Screen>;
  if (s === null) {
    return (
      <Screen>
        <Header title="خطبة غير موجودة" back />
        <View style={{ padding: 24 }}><T>لم يتم العثور على هذه الخطبة؛ ربما حُذفت.</T></View>
      </Screen>
    );
  }

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      toast(`${label}: ${e?.message ?? 'خطأ غير معروف'}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const pdfName = `${safeName(`خطبة ${s.serial} - ${s.title}`)}.pdf`;

  return (
    <Screen>
      <Header title={`خطبة رقم ${s.serial}`} subtitle={s.title} back />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <SermonReader title={s.title} serial={s.serial} date={s.sermon_date} hijri={s.hijri_date} mosque={s.mosque_name} number={s.sermon_number} category={s.category} body={s.body} notes={s.notes} />

        <View style={{ height: 22 }} />
        <Button label="تعديل الخطبة" onPress={() => router.push({ pathname: '/sermon/edit', params: { id: String(s.id) } })} />
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <Button kind="secondary" label="نسخ النص" style={{ flex: 1 }} onPress={() => run('تعذّر النسخ', async () => { await Clipboard.setStringAsync(sermonPlainText(s)); toast('تم نسخ نص الخطبة'); })} />
          <Button kind="secondary" label="مشاركة النص" style={{ flex: 1 }} onPress={() => run('تعذّرت المشاركة', async () => { await Share.share({ message: sermonPlainText(s), title: s.title }); })} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <Button kind="secondary" label="تصدير PDF" loading={busy} style={{ flex: 1 }} onPress={() => run('تعذّر إنشاء PDF', () => sharePdf(pdfName, (f) => sermonsHtml([s], f)))} />
          <Button kind="secondary" label="طباعة" style={{ flex: 1 }} onPress={() => run('تعذّرت الطباعة', () => printHtml((f) => sermonsHtml([s], f)))} />
        </View>
        <Button kind="ghost" label="العودة إلى الأرشيف" onPress={() => router.navigate('/archive')} style={{ marginTop: 10 }} />
        <Button kind="danger" label="حذف الخطبة" onPress={() => setConfirmDelete(true)} style={{ marginTop: 10 }} />
      </ScrollView>

      <Modal2 visible={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <T bold size={17}>حذف الخطبة؟</T>
        <T muted style={{ marginVertical: 10 }}>سيتم حذف «{s.title}» نهائيًا ولا يمكن التراجع. يُنصح بإنشاء نسخة احتياطية أولًا.</T>
        <Button
          kind="danger"
          label="نعم، احذف"
          onPress={async () => {
            setConfirmDelete(false);
            try {
              await repo.deleteSermon(db, s.id);
              bumpData();
              toast('تم حذف الخطبة');
              router.navigate('/archive');
            } catch (e: any) {
              toast(`تعذّر الحذف: ${e?.message ?? ''}`, 'error');
            }
          }}
        />
        <Button kind="ghost" label="إلغاء" onPress={() => setConfirmDelete(false)} style={{ marginTop: 8 }} />
      </Modal2>
    </Screen>
  );
}
