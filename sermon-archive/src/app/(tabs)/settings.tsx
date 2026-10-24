import { router } from 'expo-router';
import React from 'react';
import { ScrollView, View } from 'react-native';
import { APP_NAME } from '../../core/backup';
import { useApp } from '../../state/app';
import { Button, Card, Header, Screen, T } from '../../ui/components';
import { SermonReader } from '../../ui/Reader';
import { APP_VERSION, colors } from '../../ui/theme';

export default function Settings() {
  const { fontScale, setFontScale } = useApp();
  const pct = Math.round(fontScale * 100);
  return (
    <Screen>
      <Header title="الإعدادات" subtitle={APP_NAME} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Card style={{ marginBottom: 14 }}>
          <T bold size={16}>حجم خط نصوص الخطب</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 12 }}>
            <Button small kind="secondary" label="أ+" onPress={() => setFontScale(fontScale + 0.1)} disabled={fontScale >= 1.6} />
            <T bold size={20} style={{ color: colors.green }}>{pct}%</T>
            <Button small kind="secondary" label="أ−" onPress={() => setFontScale(fontScale - 0.1)} disabled={fontScale <= 0.8} />
          </View>
          <Button small kind="ghost" label="الحجم الافتراضي" onPress={() => setFontScale(1)} />
          <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
            <T muted size={13} style={{ marginBottom: 6 }}>معاينة:</T>
            <SermonReader title="الحمد لله رب العالمين" date="2026-01-01" body="إنَّ الحمدَ للهِ نحمدُه ونستعينُه ونستغفرُه، ونعوذُ باللهِ من شرورِ أنفسِنا ومن سيئاتِ أعمالِنا." />
          </View>
        </Card>

        <Card style={{ marginBottom: 14 }}>
          <T bold size={16}>النسخ الاحتياطي والاستعادة</T>
          <T muted size={13.5} style={{ marginVertical: 8 }}>أنشئ نسخة من كل خطبك ومساجدك، أو استعدها، أو صدّر/استورد ملفات Excel.</T>
          <Button label="فتح إدارة النسخ والتصدير" onPress={() => router.push('/backup')} />
        </Card>

        <Card>
          <T bold size={16}>عن التطبيق</T>
          <T style={{ marginTop: 8 }}>{APP_NAME} — الإصدار {APP_VERSION}</T>
          <T muted size={13.5} style={{ marginTop: 6 }}>
            سجلّ رقمي لحفظ الخطب الدينية وأرشفتها والبحث في نصوصها وتصديرها. يعمل بالكامل دون إنترنت، وتُحفظ بياناتك على هاتفك فقط، ولا يتطلب حسابًا ولا يرسل أي بيانات إلى أي خدمة خارجية.
          </T>
          <T muted size={13.5} style={{ marginTop: 6 }}>التاريخ الهجري يُحسب بخوارزمية جدولية وقد يختلف بيوم واحد عن التقويم الرسمي، ويمكنك تعديله يدويًا عند تسجيل الخطبة.</T>
        </Card>
      </ScrollView>
    </Screen>
  );
}
