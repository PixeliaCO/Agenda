/**
 * Registro de ocurrencias de alarma respondidas (Completado / Reprogramar).
 * Evita reprogramar la misma ocurrencia al volver a la app.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type AlarmAckKind = 'completed' | 'rescheduled';

export type AlarmAck = {
  reminderId: string;
  occurrenceDate: string;
  occurrenceStartTime: string;
  kind: AlarmAckKind;
  at: string;
};

const STORAGE_KEY = 'agenda_alarm_ack_v1';

function ackKey(reminderId: string, occurrenceDate: string, occurrenceStartTime: string): string {
  return `${reminderId}|${occurrenceDate}|${occurrenceStartTime}`;
}

function parseStore(raw: string | null): Record<string, AlarmAck> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, AlarmAck>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function recordAlarmAck(
  reminderId: string,
  occurrenceDate: string,
  occurrenceStartTime: string,
  kind: AlarmAckKind
): Promise<void> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const store = parseStore(raw);
  const key = ackKey(reminderId, occurrenceDate, occurrenceStartTime);
  store[key] = {
    reminderId,
    occurrenceDate,
    occurrenceStartTime,
    kind,
    at: new Date().toISOString(),
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export async function isOccurrenceAcked(
  reminderId: string,
  occurrenceDate: string,
  occurrenceStartTime: string
): Promise<boolean> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const store = parseStore(raw);
  return Boolean(store[ackKey(reminderId, occurrenceDate, occurrenceStartTime)]);
}

export async function clearAcksForReminder(reminderId: string): Promise<void> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const store = parseStore(raw);
  let changed = false;
  for (const key of Object.keys(store)) {
    if (store[key]?.reminderId === reminderId) {
      delete store[key];
      changed = true;
    }
  }
  if (changed) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }
}
