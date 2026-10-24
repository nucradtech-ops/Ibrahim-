import React from 'react';
import { View } from 'react-native';
import { formatGregorian } from '../core/dates';
import { makeSnippet, searchTerms } from '../core/arabic';
import type { SermonListItem } from '../core/types';
import { Card, T } from './components';
import { colors, fonts } from './theme';
import { Text } from 'react-native';

export function SermonRow({ s, onPress, query }: { s: SermonListItem; onPress: () => void; query?: string }) {
  const snip = query && s.body ? makeSnippet(s.body, searchTerms(query)) : null;
  return (
    <Card onPress={onPress} style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ minWidth: 42, height: 42, borderRadius: 21, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center', marginLeft: 12, paddingHorizontal: 6 }}>
          <T bold style={{ color: colors.green, textAlign: 'center' }} size={14}>{s.serial}</T>
        </View>
        <View style={{ flex: 1 }}>
          <T bold size={16} numberOfLines={2}>{s.title}</T>
          <T muted size={13} style={{ marginTop: 3 }} numberOfLines={1}>
            {formatGregorian(s.sermon_date)} · {s.mosque_name ?? 'بدون مسجد'}
          </T>
          {s.sermon_number ? <T muted size={12.5}>رقم الخطبة: {s.sermon_number}</T> : null}
          {snip ? (
            <Text style={{ fontFamily: fonts.reading, fontSize: 14, color: colors.muted, marginTop: 6, textAlign: 'right', lineHeight: 24 }} numberOfLines={3}>
              {snip.before}
              <Text style={{ backgroundColor: colors.goldSoft, color: colors.text, fontFamily: fonts.readingBold }}>{snip.match}</Text>
              {snip.after}
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

