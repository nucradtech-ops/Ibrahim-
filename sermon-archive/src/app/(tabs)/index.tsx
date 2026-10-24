import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { monthRange } from '../../core/dates';
import * as repo from '../../core/repo';
import type { SermonListItem } from '../../core/types';
import { useApp } from '../../state/app';
import { Button, Card, EmptyState, Header, Screen, Stat, T } from '../../ui/components';
import { SermonRow } from '../../ui/SermonRow';
import { colors, fonts } from '../../ui/theme';

export default function Home() {
  const { db, dataVersion } = useApp();
  const [stats, setStats] = useState<repo.Stats | null>(null);
  const [recent, setRecent] = useState<SermonListItem[]>([]);
  const [q, setQ] = useState('');

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const st = await repo.getStats(db, monthRange());
        const r = await repo.searchSermons(db, { sort: 'serial_desc' }, { limit: 5 });
        if (alive) {
          setStats(st);
          setRecent(r.items);
        }
      })();
      return () => {
        alive = false;
      };
    }, [db, dataVersion]),
  );

  const doSearch = () => router.push({ pathname: '/archive', params: { q: q.trim() } });

  const shortcuts: { label: string; glyph: string; onPress: () => void }[] = [
    { label: 'الأرشيف', glyph: '☰', onPress: () => router.push('/archive') },
    { label: 'المساجد', glyph: '◭', onPress: () => router.push('/mosques') },
    { label: 'التقارير', glyph: '▥', onPress: () => router.push('/reports') },
    { label: 'النسخ الاحتياطي', glyph: '⛁', onPress: () => router.push('/backup') },
  ];

  return (
    <Screen>
      <Header title="أرشيف الخطب" subtitle="سجلّك الرقمي المنظّم للخطب" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
          <Stat value={stats?.totalSermons ?? '…'} label="إجمالي الخطب" />
          <Stat value={stats?.totalMosques ?? '…'} label="المساجد" />
          <Stat value={stats?.thisMonth ?? '…'} label="خطب هذا الشهر" />
        </View>

        <View style={{ flexDirection: 'row', marginBottom: 14, gap: 8 }}>
          <TextInput
            value={q}
            onChangeText={setQ}
            onSubmitEditing={doSearch}
            returnKeyType="search"
            placeholder="ابحث في الموضوع أو نص الخطبة أو المسجد…"
            placeholderTextColor="#9A9A92"
            textAlign="right"
            style={{ flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, height: 50, fontFamily: fonts.regular, fontSize: 15 }}
          />
          <Button label="بحث" onPress={doSearch} style={{ minHeight: 50 }} />
        </View>

        <Button label="＋  إضافة خطبة جديدة" kind="gold" onPress={() => router.push('/sermon/edit')} style={{ marginBottom: 16, minHeight: 58 }} />

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
          {shortcuts.map((s) => (
            <Pressable
              key={s.label}
              onPress={s.onPress}
              style={({ pressed }) => ({ width: '48.5%', backgroundColor: colors.greenSoft, borderRadius: 14, paddingVertical: 16, alignItems: 'center', opacity: pressed ? 0.8 : 1 })}
            >
              <T style={{ fontSize: 24, color: colors.green, textAlign: 'center' }}>{s.glyph}</T>
              <T bold style={{ color: colors.green, marginTop: 2, textAlign: 'center' }}>{s.label}</T>
            </Pressable>
          ))}
        </View>

        <T bold size={17} style={{ marginBottom: 10 }}>آخر الخطب المضافة</T>
        {recent.length === 0 ? (
          <Card>
            <EmptyState
              title="لا توجد خطب مسجلة بعد"
              hint="ابدأ بإضافة أول خطبة، أو استورد خطبك من ملف Excel أو نسخة احتياطية."
              action={<Button label="إضافة خطبة" onPress={() => router.push('/sermon/edit')} />}
            />
          </Card>
        ) : (
          recent.map((s) => <SermonRow key={s.id} s={s} onPress={() => router.push(`/sermon/${s.id}`)} />)
        )}
      </ScrollView>
    </Screen>
  );
}
