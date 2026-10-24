# أرشيف الخطب

تطبيق جوال عربي (RTL) لتسجيل الخطب الدينية وأرشفتها والبحث في نصوصها كاملة وتصديرها والاحتفاظ بنسخ احتياطية منها.
يعمل **دون إنترنت** وبلا حساب، وتُحفظ البيانات في قاعدة SQLite محلية على الهاتف.

**التقنية:** React Native + Expo (SDK 58) + TypeScript + Expo Router + expo-sqlite.

## المتطلبات

| للتشغيل التجريبي | للبناء المحلي لـ APK | للبناء السحابي |
|---|---|---|
| Node.js 20+ وتطبيق **Expo Go** أو محاكي | Node 20+، JDK 17 أو 21، Android SDK (platform 35+ وbuild-tools)، متغير `ANDROID_HOME` | حساب Expo مجاني + `eas-cli` |

> ملاحظة: Expo Go يكفي لتجربة معظم الوظائف. اختبر التصدير/الحفظ في مجلد على بناء حقيقي (APK).

## التثبيت والتشغيل

```bash
npm install
npm start          # ثم افتح التطبيق في Expo Go أو اضغط a للمحاكي
npm run typecheck  # فحص الأنواع
npm test           # اختبارات طبقة البيانات (SQLite حقيقية)
```

## إنشاء ملف Android APK

### الطريقة 1: محليًا (بدون حساب Expo)

```bash
npm install
npx expo prebuild --platform android      # يولّد مجلد android/
cd android
./gradlew assembleRelease                 # على ويندوز: gradlew.bat assembleRelease
```

الملف الناتج:
`android/app/build/outputs/apk/release/app-release.apk`

> يُوقَّع بمفتاح debug افتراضيًا (مناسب للتثبيت المباشر على هاتفك). للنشر في المتجر أنشئ مفتاح توقيع خاصًا بك (راجع توثيق Expo لـ "release build locally").
> لنسخة تجريبية أسرع: `npx expo run:android` (يتطلب جهازًا أو محاكيًا متصلًا).

### الطريقة 2: سحابيًا عبر EAS

```bash
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview   # ينتج APK ويعطيك رابط التنزيل
```

الإعداد جاهز في `eas.json` (الملف `preview` ينتج APK، و`production` ينتج AAB للمتجر).

## iOS

الشيفرة والإعدادات مهيأة لـ iOS (`bundleIdentifier` موجود)، لكن **بناء iOS يتطلب macOS وXcode** أو خدمة EAS (`eas build --platform ios` مع حساب مطوّر Apple). لا يمكن بناؤه على Linux. لم يُجرَّب على iOS.

## هيكل المشروع

```
src/core/       منطق العمل بلا اعتماد على الواجهة (قاعدة البيانات، البحث، النسخ الاحتياطي، التصدير، الاستيراد)
src/app/        الشاشات (Expo Router)
src/platform/   الملفات، المشاركة، PDF
src/ui/         المكونات المرئية والثيم
src/state/      فتح قاعدة البيانات والإعدادات والتنبيهات
tests/          اختبارات Node
```

## قاعدة البيانات

الملف: `arshif-alkhutab.db` داخل مساحة التطبيق الخاصة. الجداول: `sermons`، `mosques`، `categories`، `meta`.
- `serial` رقم مسلسل **فريد** (فهرس UNIQUE) يُولَّد تلقائيًا ولا يُعاد استخدامه بعد الحذف.
- `sermon_number` رقم الخطبة يحدده المستخدم ومستقل تمامًا.
- فهارس على الموضوع والتاريخ والمسجد والتصنيف والسنة.
- الهجرات عبر `PRAGMA user_version` (انظر `src/core/schema.ts`): تحديث التطبيق لا يحذف البيانات.
- البحث يعمل على أعمدة مُطبَّعة (`*_norm`) تتجاهل التشكيل والهمزات والتاء المربوطة.

## صيغة النسخة الاحتياطية

ملف JSON (`format: arshif-alkhutab-backup`) يحتوي الخطب والمساجد والتصنيفات وحجم الخط، مع بصمة SHA-256 للتحقق من التلف. الاستعادة تتم في معاملة واحدة: عند أي فشل تبقى بياناتك كما هي. قبل الاستعادة تُحفظ نسخة أمان من البيانات الحالية في مجلد `safety-backups` داخل التطبيق.

## الوظائف: ما نُفِّذ وما اختُبر

انظر القسم الأخير في ملف `STATUS.md`.
