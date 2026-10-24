import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import * as repo from '../../core/repo';
import type { MosqueWithCount, SermonListItem } from '../../core/types';
import { useApp } from '../../state/app';
import { Button, Chip, Field, Header, Modal2, Screen, T } from '../../ui/components';
import { SermonRow } from '../../ui/SermonRow';
import { colors } from '../../ui/theme';

export default function MosqueDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const mid = Number(id);
  const { db, toast, bumpData } = useApp();
  const [m, setM] = useState<MosqueWithCount | null | undefined>(undefined);
  const [sermons, setSermons] = useState<SermonListItem[]>([]);
  const [others, setOthers] = useState<MosqueWithCount[]>([]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [moveTo, setMoveTo] = useState<number | null>(null);

  const load = useCallback(async () => {
    const mm = await repo.getMosque(db, mid);
    setM(mm);
    if (mm) {
      setName(mm.name);
      setNotes(mm.notes ?? '');
      setSermons((await repo.searchSermons(db, { mosqueId: mid, sort: 'date_desc' }, { limit: 500 })).items);
      setOthers((await repo.listMosques(db)).filter((x) => x.id !== mid));
    }
  }, [db, mid]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (m === undefined) return <Screen><Header title="مسجد" back /></Screen>;
  if (m === null) return <Screen><Header title="مسجد غير موجود" back /></Screen>;

  const save = async () => {
    try {
      await repo.updateMosque(db, mid, name, notes);
      setEditing(false); setErr(null);
      bumpData(); load();
      toast('تم حفظ بيانات المسجد');
    } catch (e: any) {
      setErr(e?.message ?? 'تعذّر الحفظ');
    }
  };

  const del = async (mode?: 'detach' | 'move') => {
    try {
      await repo.deleteMosque(db, mid, { mode, moveToId: moveTo ?? undefined });
      setDeleting(false);
      bumpData();
      toast(m.sermon_count ? `تم حذف المسجد وبقيت الخطب (${m.sermon_count})` : 'تم حذف المسجد');
      router.navigate('/mosques');
    } catch (e: any) {
      toast(e?.message ?? 'تعذّر الحذف', 'error');
    }
  };

  return (
    <Screen>
      <Header title={m.name} subtitle={`${m.sermon_count} خطبة مسجلة`} back />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {m.notes ? <T muted style={{ marginBottom: 12 }}>{m.notes}</T> : null}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          <Button kind="secondary" label="تعديل" style={{ flex: 1 }} onPress={() => setEditing(true)} />
          <Button kind="secondary" label="عرض في الأرشيف" style={{ flex: 1 }} onPress={() => router.navigate({ pathname: '/archive', params: { mosque: String(mid), q: '' } })} />
          <Button kind="danger" label="حذف" style={{ flex: 0.7 }} onPress={() => { setMoveTo(null); setDeleting(true); }} />
        </View>
        <T bold size={16} style={{ marginBottom: 10 }}>خطب هذا المسجد</T>
        {sermons.length === 0 ? <T muted>لا توجد خطب مرتبطة بهذا المسجد.</T> : sermons.map((s) => <SermonRow key={s.id} s={s} onPress={() => router.push(`/sermon/${s.id}`)} />)}
      </ScrollView>

      <Modal2 visible={editing} onClose={() => setEditing(false)}>
        <T bold size={17} style={{ marginBottom: 10 }}>تعديل المسجد</T>
        <Field label="اسم المسجد *" value={name} onChangeText={(v) => { setName(v); setErr(null); }} error={err} />
        <Field label="ملاحظات" value={notes} onChangeText={setNotes} multiline inputStyle={{ minHeight: 70 }} />
        <Button label="حفظ" onPress={save} />
        <Button kind="ghost" label="إلغاء" onPress={() => setEditing(false)} style={{ marginTop: 8 }} />
      </Modal2>

      <Modal2 visible={deleting} onClose={() => setDeleting(false)}>
        <T bold size={17}>حذف «{m.name}»</T>
        {m.sermon_count === 0 ? (
          <>
            <T muted style={{ marginVertical: 10 }}>لا توجد خطب مرتبطة بهذا المسجد. سيُحذف نهائيًا.</T>
            <Button kind="danger" label="حذف المسجد" onPress={() => del()} />
          </>
        ) : (
          <ScrollView style={{ maxHeight: 420 }}>
            <View style={{ backgroundColor: colors.dangerSoft, borderRadius: 10, padding: 10, marginVertical: 10 }}>
              <T style={{ color: colors.danger }} bold>تنبيه: هذا المسجد مرتبط بـ {m.sermon_count} خطبة.</T>
              <T size={13.5} style={{ marginTop: 4 }}>لن تُحذف أي خطبة. اختر ما تريد فعله بها:</T>
            </View>
            <Button kind="secondary" label="إبقاء الخطب بدون مسجد وحذف المسجد" onPress={() => del('detach')} />
            {others.length > 0 && (
              <>
                <T bold size={14} style={{ marginTop: 14, marginBottom: 6 }}>أو انقل الخطب إلى مسجد آخر:</T>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {others.map((o) => <Chip key={o.id} label={o.name} selected={moveTo === o.id} onPress={() => setMoveTo(o.id)} />)}
                </View>
                <Button kind="danger" label="نقل الخطب ثم حذف المسجد" disabled={moveTo === null} onPress={() => del('move')} />
              </>
            )}
            <Button kind="ghost" label="إلغاء" onPress={() => setDeleting(false)} style={{ marginTop: 8 }} />
          </ScrollView>
        )}
      </Modal2>
    </Screen>
  );
}
