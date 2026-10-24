import {
  Cairo_400Regular,
  Cairo_500Medium,
  Cairo_700Bold,
} from '@expo-google-fonts/cairo';
import { NotoNaskhArabic_400Regular, NotoNaskhArabic_700Bold } from '@expo-google-fonts/noto-naskh-arabic';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { I18nManager, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../state/app';
import { colors, fonts } from '../ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

// يضمن RTL حتى لو لم تُطبَّق إضافة الإعدادات بعد (يتطلب إعادة تشغيل التطبيق مرة واحدة في هذه الحالة النادرة)
try {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
} catch {}

function BrandSplash() {
  return (
    <View style={{ ...StyleAbsolute, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        <Text style={{ fontSize: 44, color: colors.gold }}>۞</Text>
      </View>
      <Text style={{ color: '#fff', fontFamily: fonts.bold, fontSize: 34 }}>أرشيف الخطب</Text>
      <Text style={{ color: colors.goldSoft, fontFamily: fonts.regular, fontSize: 14, marginTop: 6 }}>سجلّك المنظّم للخطب والمساجد</Text>
    </View>
  );
}
const StyleAbsolute = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Cairo_400Regular,
    Cairo_500Medium,
    Cairo_700Bold,
    NotoNaskhArabic_400Regular,
    NotoNaskhArabic_700Bold,
  });
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync().catch(() => {});
      const t = setTimeout(() => setShowSplash(false), 1100);
      return () => clearTimeout(t);
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppProvider>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_left' }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
      </AppProvider>
      {showSplash && <BrandSplash />}
    </SafeAreaProvider>
  );
}
