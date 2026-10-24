import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, ScrollView, TextInput, View } from 'react-native';
import { searchTerms } from '../../core/arabic';
import * as repo from '../../core/repo';
import { MosqueWithCount, NO_CATEGORY, NO_MOSQUE, SermonFilters, SermonListItem, SortKey } from '../../core/types';
import { useApp } from '../../state/app';
import { Button, Chip, EmptyState, Header, Screen, T } from '../../ui/components';
import { DateField } from '../../ui/DateField';
import { SermonRow } from '../../ui/SermonRow';
import { colors, fonts } from '../../ui/theme';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'date_desc', label: 'الأحدث تاريخًا' },
  { key: 'date_asc', label: 'الأقدم تاريخًا' },
  { key: 'serial_desc', label: 'المسلسل ↓' },
  { key: 'serial_asc', label: 'المسلسل ↑' },
  { key: 'title_asc', label: 'الموضوع (أ-ي)' },
];
const PAGE = 40;

export default function Archive() {
  const { db, dataVersion } = useApp();
  const params = useLocalSearchParams<{ q?: string; mosque?: string }>();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sort, setSort] = useState<SortKey>('date_desc');
  const [mosqueId, setMosqueId] = useState<number | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [items, setItems] = useState<SermonListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mosques, setMosques] = useState<MosqueWithCount[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const reqId = useRef(0);

  // قيم قادمة من الرئيسية أو من شاشة مسجد
  useEffect(() => {
    if (params.q !== undefined) setQuery(params.q);
    if (params.mosque !== undefined) setMosqueId(params.mosque === '' ? null : Number(params.mosque));
  }, [params.q, params.mosque]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 220);
    return () => clearTimeout(t);
  }, [query]);

  const filters = useCallback(
    (): SermonFilters => ({ query: debounced, sort, mosqueId, category, year, dateFrom, dateTo }),
    [debounced, sort, mosqueId, category, year, dateFrom, dateTo],
  );

  const load = useCallback(
    async (reset: boolean, offset = 0) => {
      const id = ++reqId.current;
      if (reset) setLoading(true);
      const r = await repo.searchSermons(db, filters(), { limit: PAGE, offset, withBody: !!debounced.trim() });
      if (id !== reqId.current) return; // طلب أقدم
      setItems((prev) => (reset ? r.items : [...prev, ...r.items]));
      setTotal(r.total);
      setLoading(false);
    },
    [db, filters, debounced],
  );

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setMosques(await repo.listMosques(db));
        setCats(await repo.listCategories(db));
        setYears(await repo.listYears(db));
      })();
      load(true);
    }, [db, load, dataVersion]),
  );

  const activeCount = [mosqueId !== null, category !== null, year !== null, !!dateFrom, !!dateTo].filter(Boolean).length;
  const reset = () => {
    setMosqueId(null); setCategory(null); setYear(null); setDateFrom(null); setDateTo(null); setQuery('');
  };

  return (
    <Screen>
      <Header title="أرشيف الخطب" subtitle={`${total} نتيجة`} />
      <View style={{ padding: 12, paddingBottom: 4 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="ابحث: موضوع، نص الخطبة، مسجد، تاريخ، رقم…"
            placeholderTextColor="#9A9A92"
            textAlign="right"
            style={{ flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, height: 50, fontFamily: fonts.regular, fontSize: 15 }}
          />
          <Button small kind={showFilters || activeCount ? 'primary' : 'secondary'} label={activeCount ? `تصفية (${activeCount})` : 'تصفية'} onPress={() => setShowFilters((v) => !v)} style={{ minHeight: 50 }} />
        </View>

        {showFilters && (
          <ScrollView style={{ maxHeight: 360, marginTop: 10 }} nestedScrollEnabled>
            <T bold size={13} muted style={{ marginBottom: 6 }}>المسجد</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <Chip label="الكل" selected={mosqueId === null} onPress={() => setMosqueId(null)} />
              {mosques.map((m) => <Chip key={m.id} label={m.name} selected={mosqueId === m.id} onPress={() => setMosqueId(m.id)} />)}
              <Chip label="بدون مسجد" selected={mosqueId === NO_MOSQUE} onPress={() => setMosqueId(NO_MOSQUE)} />
            </View>
            <T bold size={13} muted style={{ marginBottom: 6 }}>التصنيف</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <Chip label="الكل" selected={category === null} onPress={() => setCategory(null)} />
              {cats.map((c) => <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />)}
              <Chip label="بدون تصنيف" selected={category === NO_CATEGORY} onPress={() => setCategory(NO_CATEGORY)} />
            </View>
            <T bold size={13} muted style={{ marginBottom: 6 }}>السنة</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <Chip label="الكل" selected={year === null} onPress={() => setYear(null)} />
              {years.map((y) => <Chip key={y} label={String(y)} selected={year === y} onPress={() => setYear(y)} />)}
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <DateField label="من تاريخ" value={dateFrom} onChange={setDateFrom} clearable />
              <DateField label="إلى تاريخ" value={dateTo} onChange={setDateTo} clearable />
            </View>
            <Button kind="ghost" small label="مسح كل التصفية والبحث" onPress={reset} />
          </ScrollView>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }} contentContainerStyle={{ flexDirection: 'row' }}>
          {SORTS.map((s) => <Chip key={s.key} label={s.label} selected={sort === s.key} onPress={() => setSort(s.key)} />)}
        </ScrollView>
      </View>

      <FlatList
        data={items}
        keyExtractor={(s) => String(s.id)}
        contentContainerStyle={{ padding: 12, paddingBottom: 110, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <SermonRow s={item} query={debounced} onPress={() => router.push(`/sermon/${item.id}`)} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (!loading && items.length < total) load(false, items.length);
        }}
        ListEmptyComponent={
          loading ? undefined : debounced.trim() || activeCount ? (
            <EmptyState title="لا توجد نتائج مطابقة" hint="جرّب كلمات أخرى أو خفّف عوامل التصفية." action={<Button kind="secondary" label="مسح البحث والتصفية" onPress={reset} />} />
          ) : (
            <EmptyState title="لا توجد خطب مسجلة" hint="أضف أول خطبة لتظهر هنا." action={<Button label="إضافة خطبة" onPress={() => router.push('/sermon/edit')} />} />
          )
        }
      />
      <View style={{ position: 'absolute', bottom: 16, left: 16 }}>
        <Button label="＋ خطبة جديدة" kind="gold" onPress={() => router.push('/sermon/edit')} />
      </View>
    </Screen>
  );
}
