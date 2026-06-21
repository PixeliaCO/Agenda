/**
 * Intervalo horario por día (hora inicio y fin de la agenda para una fecha).
 * Cada día puede tener su propio rango (ej. 15/03/2026 de 6 a 18).
 * Si no hay intervalo guardado para una fecha, se usa el horario por defecto de preferencias.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type DaySchedule = {
  startHour: number;
  endHour: number;
};

const STORAGE_KEY = 'agenda_day_schedule_v1';
const store = new Map<string, DaySchedule>();

let hydrated = false;
let hydrating: Promise<void> | null = null;

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function hydrateOnce(): Promise<void> {
  if (hydrated) return;
  if (hydrating) return hydrating;
  hydrating = (async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const obj = safeParseJson<Record<string, DaySchedule>>(raw) ?? {};
    store.clear();
    for (const [dateISO, sched] of Object.entries(obj)) {
      if (!sched) continue;
      const startHour = typeof sched.startHour === 'number' ? sched.startHour : 6;
      const endHour = typeof sched.endHour === 'number' ? sched.endHour : 22;
      store.set(dateISO, { startHour, endHour });
    }
    hydrated = true;
  })().finally(() => {
    hydrating = null;
  });
  return hydrating;
}

async function persist(): Promise<void> {
  try {
    const obj = Object.fromEntries(store.entries());
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // no-op: mantenemos memoria si el disco falla
  }
}

function clampHour(h: number): number {
  const n = Math.round(Number(h));
  if (Number.isNaN(n)) return 8;
  return Math.max(0, Math.min(23, n));
}

/** Obtiene el intervalo del día (YYYY-MM-DD). Devuelve null si no hay uno guardado. */
export function getDaySchedule(dateISO: string): DaySchedule | null {
  return store.get(dateISO) ?? null;
}

/** Establece el intervalo para un día. Horas en 24h (0-23). */
export function setDaySchedule(dateISO: string, startHour: number, endHour: number): void {
  const start = clampHour(startHour);
  const end = clampHour(endHour);
  const orderedStart = Math.min(start, end);
  const orderedEnd = Math.max(start, end);
  store.set(dateISO, { startHour: orderedStart, endHour: orderedEnd });
  void persist();
}

/** Quita el intervalo personalizado del día (se usará el horario por defecto). */
export function clearDaySchedule(dateISO: string): void {
  store.delete(dateISO);
  void persist();
}

/** Precarga (opcional). Si no se llama, se hidrata al primer uso. */
export async function initDayScheduleStore(): Promise<void> {
  await hydrateOnce();
}
