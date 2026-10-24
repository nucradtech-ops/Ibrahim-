import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { hijriFromISO, isValidISODate, todayISO } from '../../core/dates';
import * as repo from '../../core/repo';
import { MosqueWithCount } from '../../core/types';
import { useApp } from '../../state/app';
import { Button, Chip, Field, Header, Modal2, Screen, T } from '../../ui/components';
import { DateField } from '../../ui/DateField';
import { SermonReader } from '../../ui/Reader';
import { colors } from '../../ui/theme';

interface Form {
  title: string; date: string | null; hijri: string; mosqueId: number | null; number: string; body: string; notes: string; category: string;
}
const empty = (): Form => ({ title: '', date: todayISO(), hijri: '', mosqueId: null, number: '', body: '', notes: '', category: '' });

export default function SermonEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editingId = id ? Number(id) : null;
  const { db, toast, bumpData } = useApp();
  const [form, setForm] = useState<Form>(empty());
  const [initial, setInitial] = useState<Form>(empty());
  const [serial, setSerial] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [mosques, setMosques] = useState<MosqueWithCount[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [newMosque, setNewMosque] = useState('');
  const [addingMosque, setAddingMosque] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [hijriTouched, setHijriTouched] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    (async () => {
      setMosques(await repo.listMosques(db));
      setCats(await repo.listCategories(db));
      if (editingId) {
        const s = await repo.getSermon(db, editingId);
        if (!s) {
          setLoadError(true);
          return;
        }
        const f: Form = {
          title: s.title, date: s.sermon_date, hijri: s.hijri_date ?? '', mosqueId: s.mosque_id, number: s.sermon_number ?? '',
          body: s.body, notes: s.notes ?? '', category: s.category ?? '',
        };
        setForm(f);
        setInitial(f);
        setSerial(s.serial);
        setHijriTouched(true);
      }
    })();
  }, [db, editingId]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  // الهجري يُقترح تلقائيًا ما لم يعدّله المستخدم يدويًا
  useEffect(() => {
    if (!hijriTouched && form.date && isValidISODate(form.date)) setForm((f) => ({ ...f, hijri: hijriFromISO(form.date!) }));
  }, [form.date, hijriTouched]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial), [form, initial]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = 'موضوع الخطبة مطلوب';
    if (!form.date || !isValidISODate(form.date)) e.date = 'اختر تاريخ الخطبة';
    if (!form.body.trim()) e.body = 'نص الخطبة مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) {
      toast('أكمل الحقول المطلوبة المعلّمة', 'error');
      return;
    }
    setSaving(true);
    try {
      const input = {
        title: form.title, sermon_date: form.date!, hijri_date: form.hijri, mosque_id: form.mosqueId,
        sermon_number: form.number, body: form.body, notes: form.notes, category: form.category,
      };
      const s = editingId ? await repo.updateSermon(db, editingId, input) : await repo.addSermon(db, input);
      bumpData();
      toast(editingId ? 'تم حفظ التعديلات' : `تم حفظ الخطبة برقم مسلسل ${s.serial}`);
      setInitial(form);
      router.replace(`/sermon/${s.id}`);
    } catch (e: any) {
      toast(`تعذّر الحفظ: ${e?.message ?? 'خطأ غير معروف'}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const addMosque = async () => {
    try {
      const m = await repo.findOrCreateMosque(db, newMosque);
      setMosques(await repo.listMosques(db));
      set('mosqueId', m.id);
      setNewMosque('');
      setAddingMosque(false);
      toast('تمت إضافة المسجد');
    } catch (e: any) {
      toast(e?.message ?? 'تعذّرت إضافة المسجد', 'error');
    }
  };

  const leave = () => (dirty ? setConfirmLeave(true) : router.back());
  const mosqueName = mosques.find((m) => m.id === form.mosqueId)?.name ?? null;

  if (loadError) {
    return (
      <Screen>
        <Header title="خطبة غير موجودة" back />
        <View style={{ padding: 24 }}><T>لم يتم العثور على هذه الخطبة؛ ربما حُذفت.</T></View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title={editingId ? 'تعديل الخطبة' : 'خطبة جديدة'} subtitle={serial ? `الرقم المسلسل: ${serial}` : 'الرقم المسلسل يُنشأ تلقائيًا عند الحفظ'} back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Field label="موضوع الخطبة *" value={form.title} onChangeText={(v) => set('title', v)} error={errors.title} placeholder="مثال: فضل الصلاة" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <DateField label="تاريخ الخطبة *" value={form.date} onChange={(v) => set('date', v)} error={errors.date} />
          </View>
          <Field label="التاريخ الهجري (يُحسب تلقائيًا، ويمكن تعديله)" value={form.hijri} onChangeText={(v) => { setHijriTouched(true); set('hijri', v); }} placeholder="مثال: 12 ربيع الآخر 1448 هـ" />

          <T bold size={14} style={{ color: colors.green, marginBottom: 6 }}>اسم المسجد</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Chip label="بدون مسجد" selected={form.mosqueId === null} onPress={() => set('mosqueId', null)} />
            {mosques.map((m) => <Chip key={m.id} label={m.name} selected={form.mosqueId === m.id} onPress={() => set('mosqueId', m.id)} />)}
            <Chip label="＋ مسجد جديد" onPress={() => setAddingMosque(true)} />
          </View>
          <View style={{ height: 8 }} />

          <Field label="رقم الخطبة (يحدده المستخدم)" value={form.number} onChangeText={(v) => set('number', v)} placeholder="مثال: 15" keyboardType="default" />

          <Field label="نص الخطبة *" value={form.body} onChangeText={(v) => set('body', v)} error={errors.body} multiline placeholder="اكتب أو الصق نص الخطبة كاملًا هنا…" inputStyle={{ minHeight: 280, lineHeight: 28, fontSize: 17 }} />

          <Field label="ملاحظات (اختياري)" value={form.notes} onChangeText={(v) => set('notes', v)} multiline inputStyle={{ minHeight: 80 }} />

          <T bold size={14} style={{ color: colors.green, marginBottom: 6 }}>التصنيف (اختياري)</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cats.map((c) => <Chip key={c} label={c} selected={form.category === c} onPress={() => set('category', form.category === c ? '' : c)} />)}
          </View>
          <Field label="أو اكتب تصنيفًا جديدًا" value={cats.includes(form.category) ? '' : form.category} onChangeText={(v) => set('category', v)} />

          <Button label={editingId ? 'حفظ التعديلات' : 'حفظ الخطبة'} onPress={save} loading={saving} style={{ marginTop: 6 }} />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <Button kind="secondary" label="معاينة" onPress={() => (validate() ? setPreview(true) : toast('أكمل الحقول المطلوبة أولًا', 'error'))} style={{ flex: 1 }} />
            <Button kind="secondary" label="مسح الحقول" onPress={() => setConfirmClear(true)} style={{ flex: 1 }} />
          </View>
          <Button kind="ghost" label="إلغاء والعودة" onPress={leave} style={{ marginTop: 10 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal2 visible={addingMosque} onClose={() => setAddingMosque(false)}>
        <T bold size={17} style={{ marginBottom: 10 }}>إضافة مسجد جديد</T>
        <Field label="اسم المسجد" value={newMosque} onChangeText={setNewMosque} autoFocus />
        <Button label="إضافة" onPress={addMosque} />
      </Modal2>

      <Modal2 visible={preview} onClose={() => setPreview(false)}>
        <ScrollView style={{ maxHeight: 520 }}>
          <SermonReader title={form.title} serial={serial} date={form.date ?? ''} hijri={form.hijri} mosque={mosqueName} number={form.number} category={form.category} body={form.body} notes={form.notes} />
        </ScrollView>
        <Button label="إغلاق المعاينة" onPress={() => setPreview(false)} style={{ marginTop: 10 }} />
      </Modal2>

      <Modal2 visible={confirmLeave} onClose={() => setConfirmLeave(false)}>
        <T bold size={17}>تجاهل التغييرات؟</T>
        <T muted style={{ marginVertical: 10 }}>لديك تغييرات غير محفوظة ستضيع إذا غادرت الآن.</T>
        <Button kind="danger" label="تجاهل والعودة" onPress={() => { setConfirmLeave(false); router.back(); }} />
        <Button kind="ghost" label="متابعة التحرير" onPress={() => setConfirmLeave(false)} style={{ marginTop: 8 }} />
      </Modal2>

      <Modal2 visible={confirmClear} onClose={() => setConfirmClear(false)}>
        <T bold size={17}>مسح جميع الحقول؟</T>
        <T muted style={{ marginVertical: 10 }}>{editingId ? 'سيُفرَّغ النموذج فقط، ولن تتغير الخطبة المحفوظة إلا إذا ضغطت «حفظ التعديلات».' : 'ستُفرَّغ جميع الحقول.'}</T>
        <Button kind="danger" label="مسح" onPress={() => { setForm(empty()); setHijriTouched(false); setErrors({}); setConfirmClear(false); }} />
        <Button kind="ghost" label="تراجع" onPress={() => setConfirmClear(false)} style={{ marginTop: 8 }} />
      </Modal2>
    </Screen>
  );
}
