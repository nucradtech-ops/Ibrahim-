import React from 'react';
import { View } from 'react-native';
import type { Counted } from '../core/repo';
import { T } from './components';
import { colors } from './theme';

export function Bars({ title, rows, empty = 'لا بيانات' }: { title: string; rows: Counted[]; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 12 }}>
      <T bold size={16} style={{ marginBottom: 10 }}>{title}</T>
      {rows.length === 0 ? <T muted>{empty}</T> : rows.map((r) => (
        <View key={r.label} style={{ marginBottom: 9 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T size={14} style={{ flex: 1 }} numberOfLines={1}>{r.label}</T>
            <T bold size={14} style={{ color: colors.green, marginRight: 8 }}>{r.count}</T>
          </View>
          <View style={{ height: 7, backgroundColor: colors.greenSoft, borderRadius: 4, marginTop: 3, flexDirection: 'row' }}>
            <View style={{ width: `${(r.count / max) * 100}%`, backgroundColor: colors.green, borderRadius: 4 }} />
          </View>
        </View>
      ))}
    </View>
  );
}
