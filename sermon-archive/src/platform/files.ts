import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export const MIME = {
  json: 'application/json',
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  text: 'text/plain',
};

export const safeName = (s: string, max = 60) =>
  (s.replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) || 'ملف').trim();

export const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
};

export type Content = { text: string } | { base64: string } | { fromUri: string };

function writeCache(name: string, content: Content): File {
  const dir = new Directory(Paths.cache, 'exports');
  if (!dir.exists) dir.create({ intermediates: true });
  const file = new File(dir, name);
  if (file.exists) file.delete();
  if ('fromUri' in content) {
    new File(content.fromUri).copy(file);
    return file;
  }
  file.create();
  if ('text' in content) file.write(content.text);
  else file.write(content.base64, { encoding: 'base64' });
  return file;
}

/** يكتب الملف مؤقتًا ثم يفتح قائمة المشاركة (واتساب، البريد، حفظ في الملفات...). */
export async function shareFile(name: string, mime: string, content: Content): Promise<void> {
  const file = writeCache(name, content);
  if (!(await Sharing.isAvailableAsync())) throw new Error('المشاركة غير متاحة على هذا الجهاز');
  await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: name });
}

/**
 * يحفظ الملف في مجلد يختاره المستخدم (إن دعم الجهاز ذلك)، ويعيد true عند النجاح.
 * يعيد false إذا ألغى المستخدم الاختيار.
 */
export async function saveToChosenFolder(name: string, mime: string, content: Content): Promise<boolean> {
  let dir: Directory;
  try {
    dir = await Directory.pickDirectoryAsync();
  } catch {
    return false; // أُلغي الاختيار
  }
  const cache = writeCache(name, content);
  const base = name.replace(/\.[^.]+$/, '');
  const ext = name.slice(base.length);
  let target = name;
  // لا نكتب فوق ملف موجود: نضيف رقمًا
  for (let i = 2; i < 50; i++) {
    try {
      const out = dir.createFile(target, mime);
      out.write(await cache.bytes());
      return true;
    } catch (e) {
      if (i === 49) throw e;
      target = `${base} (${i})${ext}`;
    }
  }
  return false;
}

export async function pickFile(types: string[]): Promise<{ name: string; uri: string } | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.[0]) return null;
  return { name: r.assets[0].name, uri: r.assets[0].uri };
}

export const readText = async (uri: string) => new File(uri).text();
export const readBase64 = async (uri: string) => new File(uri).base64();

let fontCache: string | undefined;
/** يضمّن خط النسخ العربي داخل PDF ليظهر النص بشكل متطابق على كل الأجهزة. */
async function embeddedFont(): Promise<string | undefined> {
  if (fontCache !== undefined) return fontCache || undefined;
  try {
    const asset = Asset.fromModule(require('@expo-google-fonts/noto-naskh-arabic/400Regular/NotoNaskhArabic_400Regular.ttf'));
    await asset.downloadAsync();
    if (!asset.localUri) throw new Error('no local uri');
    fontCache = await new File(asset.localUri).base64();
  } catch {
    fontCache = '';
  }
  return fontCache || undefined;
}

export async function makePdf(buildHtml: (font?: string) => string): Promise<{ uri: string; pages: number }> {
  const html = buildHtml(await embeddedFont());
  // A4 بالبكسل عند 72 نقطة/بوصة
  const r = await Print.printToFileAsync({ html, width: 595, height: 842 });
  return { uri: r.uri, pages: r.numberOfPages ?? 0 };
}

export async function sharePdf(name: string, buildHtml: (font?: string) => string) {
  const { uri } = await makePdf(buildHtml);
  await shareFile(name, MIME.pdf, { fromUri: uri });
}

export async function printHtml(buildHtml: (font?: string) => string) {
  const html = buildHtml(await embeddedFont());
  await Print.printAsync({ html, width: 595, height: 842 });
}

export const isWeb = Platform.OS === 'web';
