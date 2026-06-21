/**
 * Ajustes globales de comportamiento de alarmas (posponer y re-sonido automático).
 * Lee de `agenda_preferences_v2` para uso en handlers de background sin React context.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'agenda_preferences_v2';

export type AlarmBehaviorSettings = {
  snoozeMs: number;
  repeatIntervalMs: number;
  repeatCount: number;
  snoozeMinutes: number;
  repeatIntervalMinutes: number;
};

const DEFAULTS: AlarmBehaviorSettings = {
  snoozeMs: 5 * 60 * 1000,
  repeatIntervalMs: 5 * 60 * 1000,
  repeatCount: 4,
  snoozeMinutes: 5,
  repeatIntervalMinutes: 5,
};

let cache: AlarmBehaviorSettings | null = null;

export function invalidateAlarmBehaviorCache(): void {
  cache = null;
}

function clampMinutes(n: unknown, fallback: number, max = 120): number {
  const v = Math.round(Number(n));
  if (Number.isNaN(v)) return fallback;
  return Math.max(1, Math.min(max, v));
}

function clampRepeatCount(n: unknown, fallback: number): number {
  const v = Math.round(Number(n));
  if (Number.isNaN(v)) return fallback;
  return Math.max(0, Math.min(10, v));
}

function parseSettings(raw: string | null): AlarmBehaviorSettings {
  if (!raw) return { ...DEFAULTS };
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    const snoozeMinutes = clampMinutes(p.alarmSnoozeMinutes, DEFAULTS.snoozeMinutes);
    const repeatIntervalMinutes = clampMinutes(p.alarmRepeatIntervalMinutes, DEFAULTS.repeatIntervalMinutes);
    const repeatCount = clampRepeatCount(p.alarmRepeatCount, DEFAULTS.repeatCount);
    return {
      snoozeMinutes,
      repeatIntervalMinutes,
      repeatCount,
      snoozeMs: snoozeMinutes * 60 * 1000,
      repeatIntervalMs: repeatIntervalMinutes * 60 * 1000,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function getAlarmBehaviorSettings(): Promise<AlarmBehaviorSettings> {
  if (cache) return cache;
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  cache = parseSettings(raw);
  return cache;
}
