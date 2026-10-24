import * as SQLite from 'expo-sqlite';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import { migrate } from '../core/schema';
import type { Db } from '../core/types';
import { colors, fonts } from '../ui/theme';

export const DB_NAME = 'arshif-alkhutab.db';

interface Ctx {
  db: Db;
  fontScale: number;
  setFontScale: (n: number) => Promise<void>;
  toast: (msg: string, kind?: 'ok' | 'error') => void;
  /** يزيد عند أي تغيير كبير (استعادة/استيراد) لإعادة تحميل الشاشات. */
  dataVersion: number;
  bumpData: () => void;
}

const AppCtx = createContext<Ctx | null>(null);

export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error('AppProvider مفقود');
  return c;
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<Db | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fontScale, setFontScaleState] = useState(1);
  const [dataVersion, setDataVersion] = useState(0);
  const [toastState, setToastState] = useState<{ msg: string; kind: 'ok' | 'error' } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const real = await SQLite.openDatabaseAsync(DB_NAME);
        await real.execAsync('PRAGMA journal_mode = WAL;');
        const d = real as unknown as Db;
        await migrate(d);
        const row = await d.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = 'font_scale'");
        if (row) setFontScaleState(Math.min(1.6, Math.max(0.8, Number(row.value) || 1)));
        setDb(d);
      } catch (e: any) {
        setError(String(e?.message ?? e));
      }
    })();
  }, []);

  const toast = useCallback(
    (msg: string, kind: 'ok' | 'error' = 'ok') => {
      if (timer.current) clearTimeout(timer.current);
      setToastState({ msg, kind });
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      timer.current = setTimeout(
        () => Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setToastState(null)),
        kind === 'error' ? 4500 : 2500,
      );
    },
    [opacity],
  );

  const setFontScale = useCallback(
    async (n: number) => {
      const v = Math.round(Math.min(1.6, Math.max(0.8, n)) * 100) / 100;
      setFontScaleState(v);
      if (db) {
        await db.runAsync(
          "INSERT INTO meta (key, value) VALUES ('font_scale', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          [String(v)],
        );
      }
    },
    [db],
  );

  const value = useMemo<Ctx | null>(
    () =>
      db
        ? { db, fontScale, setFontScale, toast, dataVersion, bumpData: () => setDataVersion((v) => v + 1) }
        : null,
    [db, fontScale, setFontScale, toast, dataVersion],
  );

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.bg }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 20, color: colors.danger, textAlign: 'center' }}>تعذّر فتح قاعدة البيانات</Text>
        <Text style={{ fontFamily: fonts.regular, marginTop: 10, textAlign: 'center', color: colors.muted }}>{error}</Text>
      </View>
    );
  }
  if (!value) return null;

  return (
    <AppCtx.Provider value={value}>
      {children}
      {toastState && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: 90,
            left: 16,
            right: 16,
            opacity,
            backgroundColor: toastState.kind === 'error' ? colors.danger : colors.greenDark,
            borderRadius: 12,
            paddingVertical: 12,
            paddingHorizontal: 16,
          }}
        >
          <Text style={{ color: '#fff', fontFamily: fonts.medium, textAlign: 'center', fontSize: 15 }}>{toastState.msg}</Text>
        </Animated.View>
      )}
    </AppCtx.Provider>
  );
}
