/**
 * Servicio CRUD de recordatorios.
 * Implementación actual: almacenamiento local (memoria + AsyncStorage).
 * Para producción: reemplazar por llamadas fetch() a tu API REST con MongoDB.
 *
 * Ejemplo de endpoints esperados en el backend:
 *   GET    /api/reminders?date=YYYY-MM-DD
 *   POST   /api/reminders
 *   PATCH  /api/reminders/:id
 *   DELETE /api/reminders/:id
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Reminder, CreateReminderInput, UpdateReminderInput } from '../types/reminder';
import { reminderEndMinutesForLayout } from '../utils/scheduleHours';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function nowISO(): string {
  return new Date().toISOString();
}

const STORAGE_KEY = 'agenda_reminders_v1';

// Almacenamiento local: caché en memoria persistida en AsyncStorage
const store = new Map<string, Reminder>();

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
    const list = safeParseJson<Reminder[]>(raw) ?? [];
    store.clear();
    for (const r of list) {
      if (r && typeof r.id === 'string') store.set(r.id, r);
    }
    hydrated = true;
  })().finally(() => {
    hydrating = null;
  });
  return hydrating;
}

async function persist(): Promise<void> {
  try {
    const list = Array.from(store.values());
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Si falla persistencia, seguimos con memoria para no romper la UI.
  }
}

async function getAll(): Promise<Reminder[]> {
  await hydrateOnce();
  return Array.from(store.values());
}

/** Lista completa (para resync de notificaciones, export, etc.) */
export async function getAllReminders(): Promise<Reminder[]> {
  return await getAll();
}

function sortSameDay(a: Reminder, b: Reminder): number {
  if (a.noTime !== b.noTime) return a.noTime ? -1 : 1;
  const t = a.startTime.localeCompare(b.startTime);
  if (t !== 0) return t;
  return a.id.localeCompare(b.id);
}

/** Obtiene los recordatorios de una fecha (YYYY-MM-DD) */
export async function getRemindersByDate(date: string): Promise<Reminder[]> {
  const all = await getAll();
  return all.filter((r) => r.date === date).sort(sortSameDay);
}

/** Crea un recordatorio. En backend: POST /api/reminders */
export async function createReminder(input: CreateReminderInput): Promise<Reminder> {
  await hydrateOnce();
  const id = input.id ?? generateId();
  const now = nowISO();
  const endTime =
    input.noTime
      ? input.startTime
      : input.endTime != null
        ? input.endTime
        : addHour(input.startTime);
  const reminder: Reminder = {
    ...input,
    id,
    endTime,
    createdAt: now,
    updatedAt: now,
  };
  store.set(id, reminder);
  await persist();
  return reminder;
}

/** Actualiza un recordatorio. En backend: PATCH /api/reminders/:id */
export async function updateReminder(id: string, input: UpdateReminderInput): Promise<Reminder | null> {
  await hydrateOnce();
  const existing = store.get(id);
  if (!existing) return null;
  const updated: Reminder = {
    ...existing,
    ...input,
    id,
    updatedAt: nowISO(),
  };
  store.set(id, updated);
  await persist();
  return updated;
}

/** Elimina un recordatorio. En backend: DELETE /api/reminders/:id */
export async function deleteReminder(id: string): Promise<boolean> {
  await hydrateOnce();
  const ok = store.delete(id);
  await persist();
  return ok;
}

/** Obtiene un recordatorio por id */
export async function getReminderById(id: string): Promise<Reminder | null> {
  await hydrateOnce();
  return store.get(id) ?? null;
}

/** Renombra la categoría en todos los recordatorios que la usen. */
export async function renameCategoryInReminders(oldName: string, newName: string): Promise<void> {
  await hydrateOnce();
  let changed = false;
  for (const r of store.values()) {
    if (r.category === oldName) {
      store.set(r.id, { ...r, category: newName, updatedAt: nowISO() });
      changed = true;
    }
  }
  if (changed) await persist();
}

/** Quita la categoría de los recordatorios que la tengan asignada. */
export async function clearCategoryInReminders(name: string): Promise<void> {
  await hydrateOnce();
  let changed = false;
  for (const r of store.values()) {
    if (r.category === name) {
      const { category: _c, ...rest } = r;
      store.set(r.id, { ...rest, updatedAt: nowISO() });
      changed = true;
    }
  }
  if (changed) await persist();
}

export function addHour(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const next = h + 1;
  const hour = next > 23 ? 0 : next;
  return `${hour < 10 ? '0' + hour : hour}:${m < 10 ? '0' + m : m}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** True si (startTime, endTime) se cruza con algún recordatorio en la lista (excluyendo excludeId). */
export function hasTimeOverlap(
  reminders: Reminder[],
  startTime: string,
  endTime: string,
  excludeId?: string
): boolean {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  for (const r of reminders) {
    if (excludeId && r.id === excludeId) continue;
    const rStart = timeToMinutes(r.startTime);
    const rEnd = reminderEndMinutesForLayout(r.startTime, r.endTime);
    if (start < rEnd && rStart < end) return true;
  }
  return false;
}
