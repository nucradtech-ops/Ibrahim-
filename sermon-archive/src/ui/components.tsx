import { router } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius } from './theme';

export function T({ children, style, bold, muted, size, numberOfLines }: {
  children: React.ReactNode; style?: StyleProp<TextStyle>; bold?: boolean; muted?: boolean; size?: number; numberOfLines?: number;
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{ fontFamily: bold ? fonts.bold : fonts.regular, color: muted ? colors.muted : colors.text, fontSize: size ?? 15, textAlign: 'right', writingDirection: 'rtl' }, style]}
    >
      {children}
    </Text>
  );
}

/** ترويسة الشاشة بلون أخضر مع اسم التطبيق أو العنوان وزر رجوع اختياري. */
export function Header({ title, subtitle, back, right }: { title: string; subtitle?: string; back?: boolean; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: colors.green, paddingTop: insets.top + 8, paddingBottom: 14, paddingHorizontal: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {back && (
          <Pressable accessibilityLabel="رجوع" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12} style={{ marginLeft: 12, padding: 4 }}>
            <Text style={{ color: '#fff', fontSize: 26, fontFamily: fonts.bold }}>›</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: '#fff', fontFamily: fonts.bold, fontSize: 20, textAlign: 'right' }}>{title}</Text>
          {subtitle ? <Text numberOfLines={1} style={{ color: colors.goldSoft, fontFamily: fonts.regular, fontSize: 12.5, textAlign: 'right' }}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      <View style={{ height: 3, backgroundColor: colors.gold, borderRadius: 2, marginTop: 10, width: 56, alignSelf: 'flex-end' }} />
    </View>
  );
}

export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flex: 1, backgroundColor: colors.bg }, style]}>{children}</View>;
}

type BtnKind = 'primary' | 'secondary' | 'danger' | 'ghost' | 'gold';
export function Button({ label, onPress, kind = 'primary', disabled, loading, style, small }: {
  label: string; onPress: () => void; kind?: BtnKind; disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle>; small?: boolean;
}) {
  const bg = { primary: colors.green, secondary: colors.greenSoft, danger: colors.danger, ghost: 'transparent', gold: colors.gold }[kind];
  const fg = { primary: '#fff', secondary: colors.green, danger: '#fff', ghost: colors.green, gold: '#fff' }[kind];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          minHeight: small ? 42 : 52,
          borderRadius: 12,
          paddingHorizontal: 18,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
          borderWidth: kind === 'ghost' ? 1 : 0,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontFamily: fonts.bold, fontSize: small ? 14 : 16 }}>{label}</Text>}
    </Pressable>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const base: ViewStyle = { backgroundColor: colors.card, borderRadius: radius, borderWidth: 1, borderColor: colors.border, padding: 14 };
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}

export function Field({ label, error, multiline, style, inputStyle, ...rest }: TextInputProps & {
  label: string; error?: string | null; inputStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={[{ marginBottom: 14 }, style]}>
      <T bold size={14} style={{ marginBottom: 6, color: colors.green }}>{label}</T>
      <TextInput
        {...rest}
        multiline={multiline}
        placeholderTextColor="#9A9A92"
        textAlign="right"
        style={[
          {
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: error ? colors.danger : colors.border,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontFamily: fonts.regular,
            fontSize: 16,
            color: colors.text,
            writingDirection: 'rtl',
            textAlignVertical: multiline ? 'top' : 'center',
          },
          inputStyle,
        ]}
      />
      {error ? <T size={13} style={{ color: colors.danger, marginTop: 4 }}>{error}</T> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 20,
        marginLeft: 8,
        marginBottom: 8,
        backgroundColor: selected ? colors.green : '#fff',
        borderWidth: 1,
        borderColor: selected ? colors.green : colors.border,
      }}
    >
      <Text style={{ color: selected ? '#fff' : colors.text, fontFamily: fonts.medium, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <View style={{ alignItems: 'center', padding: 32 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
        <Text style={{ fontSize: 28, color: colors.gold }}>۞</Text>
      </View>
      <T bold size={17} style={{ textAlign: 'center' }}>{title}</T>
      {hint ? <T muted style={{ textAlign: 'center', marginTop: 6 }}>{hint}</T> : null}
      {action ? <View style={{ marginTop: 16 }}>{action}</View> : null}
    </View>
  );
}

export function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: radius, borderWidth: 1, borderColor: colors.border, paddingVertical: 14, alignItems: 'center' }}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 26, color: colors.green }}>{value}</Text>
      <Text style={{ fontFamily: fonts.regular, fontSize: 12.5, color: colors.muted, marginTop: 2, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

export const sheet = StyleSheet.create({
  row: { flexDirection: 'row' },
});

/** نافذة تأكيد بسيطة تُستخدم بدل Alert لتعمل بنفس الشكل في كل المنصات. */
export function Modal2({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  const { Modal } = require('react-native');
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 22 }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: colors.bg, borderRadius: 18, padding: 18, maxHeight: '85%' }}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
