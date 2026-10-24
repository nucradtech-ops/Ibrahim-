import React from 'react';
import { Text, View } from 'react-native';
import { formatGregorian } from '../core/dates';
import { useApp } from '../state/app';
import { T } from './components';
import { colors, fonts } from './theme';

export function MetaRow({ k, v }: { k: string; v: string | null | undefined }) {
  if (!v) return null;
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 5 }}>
      <T muted size={13.5} style={{ width: 104 }}>{k}</T>
      <T bold size={14.5} style={{ flex: 1 }}>{v}</T>
    </View>
  );
}

export function SermonReader({ title, serial, date, hijri, mosque, number, category, body, notes }: {
  title: string; serial?: number | null; date: string; hijri?: string | null; mosque?: string | null; number?: string | null;
  category?: string | null; body: string; notes?: string | null;
}) {
  const { fontScale } = useApp();
  const size = 18 * fontScale;
  return (
    <View>
      <Text style={{ fontFamily: fonts.readingBold, fontSize: 24 * fontScale, color: colors.green, textAlign: 'right', lineHeight: 40 * fontScale, writingDirection: 'rtl' }}>{title}</Text>
      <View style={{ backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, marginVertical: 12 }}>
        <MetaRow k="الرقم المسلسل" v={serial ? String(serial) : null} />
        <MetaRow k="التاريخ" v={formatGregorian(date)} />
        <MetaRow k="الهجري" v={hijri} />
        <MetaRow k="المسجد" v={mosque ?? 'بدون مسجد'} />
        <MetaRow k="رقم الخطبة" v={number} />
        <MetaRow k="التصنيف" v={category} />
      </View>
      <Text selectable style={{ fontFamily: fonts.reading, fontSize: size, lineHeight: size * 2, color: colors.text, textAlign: 'right', writingDirection: 'rtl' }}>
        {body}
      </Text>
      {notes ? (
        <View style={{ backgroundColor: colors.goldSoft, borderRightWidth: 4, borderRightColor: colors.gold, borderRadius: 8, padding: 12, marginTop: 18 }}>
          <T bold size={14} style={{ color: '#6b5a2e' }}>ملاحظات</T>
          <T style={{ marginTop: 4 }}>{notes}</T>
        </View>
      ) : null}
    </View>
  );
}
