import { Tabs } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../../ui/theme';

const icon = (glyph: string) => ({ color }: { color: any }) => <Text style={{ fontSize: 20, color }}>{glyph}</Text>;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: '#8C8C84',
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 12 },
        tabBarStyle: { height: 62 + insets.bottom, paddingBottom: insets.bottom + 6, paddingTop: 6, backgroundColor: '#fff', borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'الرئيسية', tabBarIcon: icon('⌂') }} />
      <Tabs.Screen name="archive" options={{ title: 'الأرشيف', tabBarIcon: icon('☰') }} />
      <Tabs.Screen name="mosques" options={{ title: 'المساجد', tabBarIcon: icon('◭') }} />
      <Tabs.Screen name="reports" options={{ title: 'التقارير', tabBarIcon: icon('▥') }} />
      <Tabs.Screen name="settings" options={{ title: 'الإعدادات', tabBarIcon: icon('⚙') }} />
    </Tabs>
  );
}
