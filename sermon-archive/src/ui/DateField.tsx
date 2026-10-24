import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { formatGregorian, isValidISODate, parseISODate, toISODate } from '../core/dates';
import { Button, Modal2, T } from './components';
import { colors } from './theme';

export function DateField({ label, value, onChange, error, clearable }: {
  label: string; value: string | null; onChange: (iso: string | null) => void; error?: string | null; clearable?: boolean;
}) {
  const [iosOpen, setIosOpen] = useState(false);
  const current = value && isValidISODate(value) ? parseISODate(value) : new Date();

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        onValueChange: (_e, d) => onChange(toISODate(d)),
      });
    } else setIosOpen(true);
  };

  return (
    <View style={{ marginBottom: 14, flex: 1 }}>
      <T bold size={14} style={{ marginBottom: 6, color: colors.green }}>{label}</T>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={open}
          style={{ flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: error ? colors.danger : colors.border, borderRadius: 12, paddingHorizontal: 14, minHeight: 50, justifyContent: 'center' }}
        >
          <T style={{ color: value ? colors.text : '#9A9A92' }} size={16}>{value ? formatGregorian(value) : 'اختر التاريخ'}</T>
        </Pressable>
        {clearable && value ? <Button small kind="ghost" label="مسح" onPress={() => onChange(null)} style={{ minHeight: 50 }} /> : null}
      </View>
      {error ? <T size={13} style={{ color: colors.danger, marginTop: 4 }}>{error}</T> : null}
      {Platform.OS !== 'android' && (
        <Modal2 visible={iosOpen} onClose={() => setIosOpen(false)}>
          <DateTimePicker value={current} mode="date" display="inline" onValueChange={(_, d) => onChange(toISODate(d))} />
          <Button label="تم" onPress={() => setIosOpen(false)} />
        </Modal2>
      )}
    </View>
  );
}
