/** واجهة قاعدة البيانات: تطابق شكل expo-sqlite غير المتزامن، وتُنفَّذ في الاختبارات عبر node:sqlite. */
export interface RunResult {
  changes: number;
  lastInsertRowId: number;
}

export type SqlParam = string | number | null;

export interface Db {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: SqlParam[]): Promise<RunResult>;
  getAllAsync<T = any>(sql: string, params?: SqlParam[]): Promise<T[]>;
  getFirstAsync<T = any>(sql: string, params?: SqlParam[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

export interface Mosque {
  id: number;
  name: string;
  notes: string | null;
  created_at: string;
}

export interface MosqueWithCount extends Mosque {
  sermon_count: number;
}

export interface Sermon {
  id: number;
  serial: number;
  title: string;
  sermon_date: string; // YYYY-MM-DD
  hijri_date: string | null;
  mosque_id: number | null;
  mosque_name: string | null;
  sermon_number: string | null;
  body: string;
  notes: string | null;
  category: string | null;
  year: number;
  created_at: string;
  updated_at: string;
}

/** صف خفيف للقوائم (دون النص الكامل). */
export interface SermonListItem {
  id: number;
  serial: number;
  title: string;
  sermon_date: string;
  mosque_id: number | null;
  mosque_name: string | null;
  sermon_number: string | null;
  category: string | null;
  body?: string; // يُملأ فقط عند البحث لعرض المقتطف
}

export interface SermonInput {
  title: string;
  sermon_date: string;
  hijri_date?: string | null;
  mosque_id?: number | null;
  sermon_number?: string | null;
  body: string;
  notes?: string | null;
  category?: string | null;
}

export type SortKey = 'date_desc' | 'date_asc' | 'serial_desc' | 'serial_asc' | 'title_asc';

export interface SermonFilters {
  query?: string;
  mosqueId?: number | null; // -1 = بدون مسجد
  category?: string | null; // '__none__' = بدون تصنيف
  year?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  sort?: SortKey;
}

export const NO_MOSQUE = -1;
export const NO_CATEGORY = '__none__';
