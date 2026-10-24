import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import * as repo from '../../core/repo';
import type { MosqueWithCount } from '../../core/types';
import { useApp } from '../../state/app';
import { Button, Card, EmptyState, Field, Header, Modal2, Screen, T } from '../../ui/components';
import { colors, fonts } from '../../ui/theme';

export default function Mosques() {
  const { db, toast, bumpData, dataVersion } = useApp();
  const [list, setList] = useState<MosqueWithCount[]>([]);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => setList(await repo.listMosques(db, q)), [db, q]);
  useFocusEffect(useCallback(() => { load(); }, [load, dataVersion]));

  const add = async () => {
    try {
      await repo.addMosque(db, name, notes);
      setAdding(false); setName(''); setNotes(''); setErr(null);
      bumpData();
      toast('تمت إضافة المسجد');
    } catch (e: any) {
      setErr(e?.message ?? 'تعذّرت الإضافة');
    }
  };

  return (
    <Screen>
      <Header title="المساجد" subtitle={`${list.length} مسجد`} />
      <View style={{ padding: 12, flexDirection: 'row', gap: 8 }}>
        <TextInput value={q} onChangeText={setQ} placeholder="ابحث عن مسجد…" placeholderTextColor="#9A9A92" textAlign="right"
          style={{ flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, height: 50, fontFamily: fonts.regular, fontSize: 15 }} />
        <Button label="＋ مسجد" onPress={() => setAdding(true)} style={{ minHeight: 50 }} />
      </View>
      <FlatList
        data={list}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={{ padding: 12, paddingTop: 0, flexGrow: 1 }}
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/mosque/${item.id}`)} style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <T bold size={16}>{item.name}</T>
                {item.notes ? <T muted size={13} numberOfLines={1}>{item.notes}</T> : null}
              </View>
              <View style={{ backgroundColor: colors.greenSoft, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4 }}>
                <T bold style={{ color: colors.green }} size={13}>{item.sermon_count} خطبة</T>
              </View>
            </View>
          </Card>
        )}
        ListEmptyComponent={
          q.trim() ? <EmptyState title="لا توجد مساجد مطابقة" /> : <EmptyState title="لا توجد مساجد مسجّلة" hint="أضف مسجدًا ثم اربط به خطبك." action={<Button label="إضافة مسجد" onPress={() => setAdding(true)} />} />
        }
      />
      <Modal2 visible={adding} onClose={() => setAdding(false)}>
        <T bold size={17} style={{ marginBottom: 10 }}>إضافة مسجد</T>
        <Field label="اسم المسجد *" value={name} onChangeText={(v) => { setName(v); setErr(null); }} error={err} autoFocus />
        <Field label="ملاحظات (اختياري)" value={notes} onChangeText={setNotes} multiline inputStyle={{ minHeight: 70 }} />
        <Button label="حفظ" onPress={add} />
        <Button kind="ghost" label="إلغاء" onPress={() => setAdding(false)} style={{ marginTop: 8 }} />
      </Modal2>
    </Screen>
  );
}
