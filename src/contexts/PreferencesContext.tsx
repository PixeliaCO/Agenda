/**
 * Preferencias de la agenda: tamaño de letra, modo oscuro y rango horario del día.
 */

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightTheme, darkTheme, type ThemeColors } from '../constants/theme';
import { invalidateAlarmBehaviorCache } from '../services/alarmBehaviorService';

export type FontSizeKey = 'small' | 'normal' | 'large';

export type Preferences = {
  fontSize: FontSizeKey;
  darkMode: boolean;
  scheduleStartHour: number;
  scheduleEndHour: number;
  /** Minutos para «Recordar nuevamente» (posponer alarma). */
  alarmSnoozeMinutes: number;
  /** Intervalo entre re-sonidos automáticos si no respondes. */
  alarmRepeatIntervalMinutes: number;
  /** Re-sonidos extra tras el primer aviso (0 = solo una vez). */
  alarmRepeatCount: number;
};

const DEFAULT_PREFERENCES: Preferences = {
  fontSize: 'normal',
  darkMode: false,
  scheduleStartHour: 6,
  scheduleEndHour: 22,
  alarmSnoozeMinutes: 5,
  alarmRepeatIntervalMinutes: 5,
  alarmRepeatCount: 4,
};

const STORAGE_KEY = 'agenda_preferences_v2';

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function sanitizePreferences(input: unknown): Preferences {
  const p = (input ?? {}) as Partial<Preferences>;
  const fontSize: FontSizeKey =
    p.fontSize === 'small' || p.fontSize === 'large' || p.fontSize === 'normal'
      ? p.fontSize
      : DEFAULT_PREFERENCES.fontSize;
  const darkMode = typeof p.darkMode === 'boolean' ? p.darkMode : DEFAULT_PREFERENCES.darkMode;
  const scheduleStartHour = clampHour((p as any).scheduleStartHour ?? DEFAULT_PREFERENCES.scheduleStartHour);
  const scheduleEndHour = clampHour((p as any).scheduleEndHour ?? DEFAULT_PREFERENCES.scheduleEndHour);
  const orderedStart = Math.min(scheduleStartHour, scheduleEndHour);
  const orderedEnd = Math.max(scheduleStartHour, scheduleEndHour);
  const alarmSnoozeMinutes = clampAlarmMinutes(
    (p as Partial<Preferences>).alarmSnoozeMinutes ?? DEFAULT_PREFERENCES.alarmSnoozeMinutes
  );
  const alarmRepeatIntervalMinutes = clampAlarmMinutes(
    (p as Partial<Preferences>).alarmRepeatIntervalMinutes ??
      DEFAULT_PREFERENCES.alarmRepeatIntervalMinutes
  );
  const alarmRepeatCount = clampAlarmRepeatCount(
    (p as Partial<Preferences>).alarmRepeatCount ?? DEFAULT_PREFERENCES.alarmRepeatCount
  );
  return {
    fontSize,
    darkMode,
    scheduleStartHour: orderedStart,
    scheduleEndHour: orderedEnd,
    alarmSnoozeMinutes,
    alarmRepeatIntervalMinutes,
    alarmRepeatCount,
  };
}

function clampAlarmMinutes(n: number, max = 120): number {
  const v = Math.round(Number(n));
  if (Number.isNaN(v)) return DEFAULT_PREFERENCES.alarmSnoozeMinutes;
  return Math.max(1, Math.min(max, v));
}

function clampAlarmRepeatCount(n: number): number {
  const v = Math.round(Number(n));
  if (Number.isNaN(v)) return DEFAULT_PREFERENCES.alarmRepeatCount;
  return Math.max(0, Math.min(10, v));
}

type PreferencesContextValue = {
  preferences: Preferences;
  setFontSize: (key: FontSizeKey) => void;
  setDarkMode: (on: boolean) => void;
  setScheduleHours: (start: number, end: number) => void;
  setAlarmBehavior: (snoozeMinutes: number, repeatIntervalMinutes: number, repeatCount: number) => void;
  fontScale: number;
  colors: ThemeColors;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = safeParseJson<Preferences>(raw);
      if (cancelled) return;
      if (parsed) setPreferences(sanitizePreferences(parsed));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    invalidateAlarmBehaviorCache();
  }, [preferences]);

  const setFontSize = useCallback((fontSize: FontSizeKey) => {
    setPreferences((p) => ({ ...p, fontSize }));
  }, []);

  const setDarkMode = useCallback((darkMode: boolean) => {
    setPreferences((p) => ({ ...p, darkMode }));
  }, []);

  const setScheduleHours = useCallback((scheduleStartHour: number, scheduleEndHour: number) => {
    const start = clampHour(scheduleStartHour);
    const end = clampHour(scheduleEndHour);
    const orderedStart = Math.min(start, end);
    const orderedEnd = Math.max(start, end);
    setPreferences((p) => ({ ...p, scheduleStartHour: orderedStart, scheduleEndHour: orderedEnd }));
  }, []);

  const setAlarmBehavior = useCallback(
    (alarmSnoozeMinutes: number, alarmRepeatIntervalMinutes: number, alarmRepeatCount: number) => {
      setPreferences((p) => ({
        ...p,
        alarmSnoozeMinutes: clampAlarmMinutes(alarmSnoozeMinutes),
        alarmRepeatIntervalMinutes: clampAlarmMinutes(alarmRepeatIntervalMinutes),
        alarmRepeatCount: clampAlarmRepeatCount(alarmRepeatCount),
      }));
    },
    []
  );

  const fontScale =
    preferences.fontSize === 'small' ? 0.88 : preferences.fontSize === 'large' ? 1.18 : 1;
  const colors = useMemo(
    () => (preferences.darkMode ? darkTheme : lightTheme),
    [preferences.darkMode]
  );

  const value: PreferencesContextValue = useMemo(
    () => ({
      preferences,
      setFontSize,
      setDarkMode,
      setScheduleHours,
      setAlarmBehavior,
      fontScale,
      colors,
    }),
    [preferences, setFontSize, setDarkMode, setScheduleHours, setAlarmBehavior, fontScale, colors]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

function clampHour(h: number): number {
  const n = Math.round(Number(h));
  if (Number.isNaN(n)) return 8;
  return Math.max(0, Math.min(23, n));
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}
