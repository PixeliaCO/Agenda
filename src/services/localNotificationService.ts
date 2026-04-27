/**
 * Notificaciones locales para alarmas de eventos (sin servidor).
 * Siempre: aviso con alarma a la hora de inicio. Con "Activar alarma": además aviso de anticipación.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as IntentLauncher from 'expo-intent-launcher';
import { DeviceEventEmitter, Platform } from 'react-native';
import type { EventSubscription } from 'expo-modules-core';
import * as Notifications from 'expo-notifications';
import type { Reminder } from '../types/reminder';
import { formatTime12h } from '../utils/date';
import { deleteReminder } from './reminderService';

/** Emite al borrar un evento desde la notificación (Eliminar); la UI debe refrescar. */
export const REMINDER_DELETED_FROM_NOTIFICATION = 'agenda:reminder-deleted';

/** Anticipación: canal con sonido `alert` (res/raw) del bundle. */
const ANDROID_CHANNEL_ANTICIPATION = 'agenda-anticipation-alert';
/**
 * Inicio del evento (Android): canal creado en nativo con URI a `res/raw/alert` (alert.mp3 vía prebuild).
 * iOS: mismo archivo en el bundle (plugin expo-notifications).
 */
const ANDROID_CHANNEL_EVENT_START = 'agenda-event-phone-alarm';
/** Nombre del archivo en el bundle (iOS y referencia Android en contenido). */
const EVENT_START_SOUND_FILE = 'alert.mp3';
/** Mismo sonido para recordatorio de anticipación. */
const ANTICIPATION_SOUND_FILE = 'alert.mp3';

const MAX_DATE_TRIGGERS = 32;

/** Android 12–13: sin permiso de alarmas exactas, el SO retrasa disparos hasta abrir la app (setAndAllowWhileIdle). */
const ANDROID_EXACT_ALARM_PROMPT_KEY = 'agenda_android_exact_alarm_settings_prompt_v1';

function androidApiLevel(): number {
  if (Platform.OS !== 'android') return 0;
  return typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10) || 0;
}

/**
 * Abre una sola vez la pantalla del sistema para permitir alarmas exactas (Android 12–13).
 * En Android 14+ suele bastar `USE_EXACT_ALARM` en el manifest.
 */
async function maybeOpenAndroidExactAlarmSettingsOnce(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const api = androidApiLevel();
  if (api < 31 || api >= 34) return;
  try {
    const done = await AsyncStorage.getItem(ANDROID_EXACT_ALARM_PROMPT_KEY);
    if (done === '1') return;
    const pkg = Constants.expoConfig?.android?.package;
    if (!pkg) return;
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.REQUEST_SCHEDULE_EXACT_ALARM, {
      data: `package:${pkg}`,
    });
    await AsyncStorage.setItem(ANDROID_EXACT_ALARM_PROMPT_KEY, '1');
  } catch {
    /* usuario canceló o OEM sin esa pantalla */
  }
}

/** Datos embebidos para acciones de la notificación aunque el recordatorio no esté en memoria */
type AlarmNotifPayload = {
  reminderId: string;
  alarmKind: 'anticipation' | 'start';
  titleSnapshot: string;
  startTimeSnapshot: string;
  dateSnapshot: string;
};

const CATEGORY_ALARM_START = 'agenda_alarm_start';
const CATEGORY_ALARM_ANTICIPATION = 'agenda_alarm_anticipation';

/** Detener alarma (cierra notificación / silencia). */
const ACTION_DETENER = 'DETENER';
/** Eliminar el evento y sus notificaciones programadas. */
const ACTION_ELIMINAR = 'ELIMINAR';
/** iOS: usuario descartó la notificación (equivale a Detener). */
const IOS_DISMISS_ACTION = 'com.apple.UNNotificationDismissActionIdentifier';

/** Misma categoría en iOS/Android: botones en la notificación */
const ALARM_NOTIFICATION_ACTIONS: Notifications.NotificationAction[] = [
  {
    identifier: ACTION_DETENER,
    buttonTitle: 'Detener',
    options: { opensAppToForeground: true },
  },
  {
    identifier: ACTION_ELIMINAR,
    buttonTitle: 'Eliminar',
    options: { opensAppToForeground: true, isDestructive: true },
  },
];

let notificationResponseSubscription: EventSubscription | null = null;

function payloadFromReminder(reminder: Reminder, alarmKind: 'anticipation' | 'start'): AlarmNotifPayload {
  return {
    reminderId: reminder.id,
    alarmKind,
    titleSnapshot: reminder.title?.trim() || 'Evento',
    startTimeSnapshot: reminder.startTime,
    dateSnapshot: reminder.date,
  };
}

function parseAlarmPayload(data: Record<string, unknown> | undefined): AlarmNotifPayload | null {
  if (!data || typeof data !== 'object') return null;
  const reminderId = data.reminderId;
  const alarmKind = data.alarmKind;
  if (typeof reminderId !== 'string' || (alarmKind !== 'anticipation' && alarmKind !== 'start')) {
    return null;
  }
  const titleSnapshot = typeof data.titleSnapshot === 'string' ? data.titleSnapshot : 'Evento';
  const startTimeSnapshot = typeof data.startTimeSnapshot === 'string' ? data.startTimeSnapshot : '09:00';
  const dateSnapshot = typeof data.dateSnapshot === 'string' ? data.dateSnapshot : '2000-01-01';
  return {
    reminderId,
    alarmKind,
    titleSnapshot,
    startTimeSnapshot,
    dateSnapshot,
  };
}

function isAlarmAction(actionId: string): boolean {
  return (
    actionId === ACTION_DETENER ||
    actionId === ACTION_ELIMINAR ||
    actionId === IOS_DISMISS_ACTION
  );
}

async function dismissPresentedNotification(response: Notifications.NotificationResponse): Promise<void> {
  try {
    await Notifications.dismissNotificationAsync(response.notification.request.identifier);
  } catch {
    /* ya no está en la bandeja */
  }
}

async function handleAlarmNotificationResponse(response: Notifications.NotificationResponse): Promise<void> {
  const actionId = response.actionIdentifier;
  if (actionId === Notifications.DEFAULT_ACTION_IDENTIFIER) return;
  if (!isAlarmAction(actionId)) return;

  const payload = parseAlarmPayload(response.notification.request.content.data as Record<string, unknown>);
  const isEliminar = actionId === ACTION_ELIMINAR;
  const isDetener = actionId === ACTION_DETENER || actionId === IOS_DISMISS_ACTION;

  if (isEliminar) {
    if (!payload) return;
    await cancelNotificationsForReminder(payload.reminderId);
    await deleteReminder(payload.reminderId);
    DeviceEventEmitter.emit(REMINDER_DELETED_FROM_NOTIFICATION, { reminderId: payload.reminderId });
    await dismissPresentedNotification(response);
    return;
  }

  if (isDetener) {
    await dismissPresentedNotification(response);
  }
}

function isNativeMobile(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

function offsetToMs(offset: number, unit: NonNullable<Reminder['alarmUnit']>): number {
  switch (unit) {
    case 'hours':
      return offset * 60 * 60 * 1000;
    case 'days':
      return offset * 24 * 60 * 60 * 1000;
    default:
      return offset * 60 * 1000;
  }
}

/** Inicio del evento en hora local (usa startTime; “todo el día” guarda el rango de la agenda) */
function eventStartLocal(reminder: Reminder): Date {
  const [y, m, d] = reminder.date.split('-').map(Number);
  const [hh, mm] = reminder.startTime.split(':').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
}

function alarmFireLocal(reminder: Reminder): Date {
  const start = eventStartLocal(reminder);
  const offset = reminder.alarmOffset ?? 1;
  const unit = reminder.alarmUnit ?? 'minutes';
  return new Date(start.getTime() - offsetToMs(offset, unit));
}

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

function toDateISO(d: Date): string {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function advanceDateISO(dateISO: string, repeat: NonNullable<Reminder['repeat']>, interval: number): string {
  const d = new Date(dateISO + 'T12:00:00');
  switch (repeat) {
    case 'daily':
      d.setDate(d.getDate() + interval);
      break;
    case 'weekly':
      d.setDate(d.getDate() + 7 * interval);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + interval);
      break;
    case 'yearly':
      d.setFullYear(d.getFullYear() + interval);
      break;
    default:
      return dateISO;
  }
  return toDateISO(d);
}

/** Domingo=1 … sábado=7 (Expo weekly trigger) */
function expoWeekdayFromDate(d: Date): number {
  return d.getDay() + 1;
}

function baseContent(
  reminder: Reminder,
  body: string,
  alarmKind: 'anticipation' | 'start'
): Notifications.NotificationContentInput {
  const title = reminder.title?.trim() || 'Evento';
  const p = payloadFromReminder(reminder, alarmKind);
  return {
    title,
    body,
    sound: true,
    data: {
      reminderId: p.reminderId,
      alarmKind: p.alarmKind,
      titleSnapshot: p.titleSnapshot,
      startTimeSnapshot: p.startTimeSnapshot,
      dateSnapshot: p.dateSnapshot,
    },
  };
}

function buildAnticipationContent(reminder: Reminder): Notifications.NotificationContentInput {
  const when = reminder.allDay
    ? `todo el día · ${formatTime12h(reminder.startTime)}`
    : formatTime12h(reminder.startTime);
  return {
    ...baseContent(reminder, `Recordatorio antes del inicio · ${when}`, 'anticipation'),
    categoryIdentifier: CATEGORY_ALARM_ANTICIPATION,
    autoDismiss: false,
    sticky: false,
    ...(Platform.OS === 'ios'
      ? { interruptionLevel: 'active' as const, sound: ANTICIPATION_SOUND_FILE }
      : {
          priority: Notifications.AndroidNotificationPriority.HIGH,
          sound: ANTICIPATION_SOUND_FILE,
        }),
  };
}

function buildStartContent(reminder: Reminder): Notifications.NotificationContentInput {
  const body = reminder.allDay
    ? `Todo el día · ${formatTime12h(reminder.startTime)}`
    : `Empieza ahora · ${formatTime12h(reminder.startTime)}`;
  return {
    ...baseContent(reminder, body, 'start'),
    categoryIdentifier: CATEGORY_ALARM_START,
    sound: EVENT_START_SOUND_FILE,
    autoDismiss: false,
    // Android: ongoing => no swipe; solo Detener/Eliminar
    sticky: Platform.OS === 'android',
    ...(Platform.OS === 'ios'
      ? { interruptionLevel: 'timeSensitive' as const }
      : {
          priority: Notifications.AndroidNotificationPriority.MAX,
        }),
  };
}

/** Canal Android + handler en primer arranque */
export async function initLocalNotifications(): Promise<void> {
  if (!isNativeMobile()) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  try {
    const categoryOpts: Notifications.NotificationCategoryOptions | undefined =
      Platform.OS === 'ios' ? { customDismissAction: true } : undefined;
    await Notifications.setNotificationCategoryAsync(
      CATEGORY_ALARM_START,
      ALARM_NOTIFICATION_ACTIONS,
      categoryOpts
    );
    await Notifications.setNotificationCategoryAsync(
      CATEGORY_ALARM_ANTICIPATION,
      ALARM_NOTIFICATION_ACTIONS,
      categoryOpts
    );
  } catch {
    /* categorías no disponibles en algunos entornos */
  }

  if (notificationResponseSubscription) {
    notificationResponseSubscription.remove();
    notificationResponseSubscription = null;
  }
  notificationResponseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    void handleAlarmNotificationResponse(response);
  });

  try {
    const last = Notifications.getLastNotificationResponse();
    if (
      last != null &&
      last.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER &&
      isAlarmAction(last.actionIdentifier)
    ) {
      await handleAlarmNotificationResponse(last);
      Notifications.clearLastNotificationResponse();
    }
  } catch {
    /* sin respuesta pendiente */
  }

  if (Platform.OS === 'android') {
    /** Canal de inicio: AgendaSystemAlarmChannel (config plugin en prebuild / MainApplication) */
    for (const oldId of ['agenda-anticipation'] as const) {
      try {
        await Notifications.deleteNotificationChannelAsync(oldId);
      } catch {
        /* ya no existe */
      }
    }
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ANTICIPATION, {
      name: 'Recordatorios (anticipación)',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
      sound: 'alert',
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.ALARM,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      },
    });
    for (const oldId of ['agenda-event-start', 'agenda-event-alarm'] as const) {
      try {
        await Notifications.deleteNotificationChannelAsync(oldId);
      } catch {
        /* opcional */
      }
    }

    // Tras primer arranque, una sola vez en Android 12–13: pedir “Alarmas y recordatorios” para que suenen con la app cerrada.
    setTimeout(() => {
      void maybeOpenAndroidExactAlarmSettingsOnce();
    }, 2500);
  }
}

async function ensurePermissions(): Promise<boolean> {
  if (!isNativeMobile()) return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function cancelNotificationsForReminder(reminderId: string): Promise<void> {
  if (!isNativeMobile()) return;
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const req of all) {
      const rid = req.content.data?.reminderId;
      if (rid === reminderId) {
        await Notifications.cancelScheduledNotificationAsync(req.identifier);
      }
    }
  } catch {
    /* getAll no disponible en algunos entornos */
  }
}

type SchedulableTrigger = NonNullable<Notifications.NotificationRequestInput['trigger']>;

async function scheduleWithTrigger(
  reminder: Reminder,
  identifier: string,
  trigger: SchedulableTrigger,
  content: Notifications.NotificationContentInput,
  androidChannelId: string
): Promise<void> {
  const finalTrigger: SchedulableTrigger =
    Platform.OS === 'android' && trigger && typeof trigger === 'object' && 'type' in trigger
      ? ({ ...trigger, channelId: androidChannelId } as SchedulableTrigger)
      : trigger;
  await Notifications.scheduleNotificationAsync({
    identifier,
    content,
    trigger: finalTrigger,
  });
}

type RepeatKind = NonNullable<Reminder['repeat']>;

async function scheduleNativePair(
  reminder: Reminder,
  repeat: RepeatKind,
  fireAnticipation: Date,
  fireStart: Date
): Promise<void> {
  const idA = `agenda-a-${reminder.id}`;
  const idS = `agenda-s-${reminder.id}`;
  const contentA = buildAnticipationContent(reminder);
  const contentS = buildStartContent(reminder);

  if (repeat === 'daily') {
    await scheduleWithTrigger(
      reminder,
      idA,
      {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: fireAnticipation.getHours(),
        minute: fireAnticipation.getMinutes(),
      },
      contentA,
      ANDROID_CHANNEL_ANTICIPATION
    );
    await scheduleWithTrigger(
      reminder,
      idS,
      {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: fireStart.getHours(),
        minute: fireStart.getMinutes(),
      },
      contentS,
      ANDROID_CHANNEL_EVENT_START
    );
    return;
  }
  if (repeat === 'weekly') {
    await scheduleWithTrigger(
      reminder,
      idA,
      {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: expoWeekdayFromDate(fireAnticipation),
        hour: fireAnticipation.getHours(),
        minute: fireAnticipation.getMinutes(),
      },
      contentA,
      ANDROID_CHANNEL_ANTICIPATION
    );
    await scheduleWithTrigger(
      reminder,
      idS,
      {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: expoWeekdayFromDate(fireStart),
        hour: fireStart.getHours(),
        minute: fireStart.getMinutes(),
      },
      contentS,
      ANDROID_CHANNEL_EVENT_START
    );
    return;
  }
  if (repeat === 'monthly') {
    await scheduleWithTrigger(
      reminder,
      idA,
      {
        type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
        day: fireAnticipation.getDate(),
        hour: fireAnticipation.getHours(),
        minute: fireAnticipation.getMinutes(),
      },
      contentA,
      ANDROID_CHANNEL_ANTICIPATION
    );
    await scheduleWithTrigger(
      reminder,
      idS,
      {
        type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
        day: fireStart.getDate(),
        hour: fireStart.getHours(),
        minute: fireStart.getMinutes(),
      },
      contentS,
      ANDROID_CHANNEL_EVENT_START
    );
    return;
  }
  if (repeat === 'yearly') {
    await scheduleWithTrigger(
      reminder,
      idA,
      {
        type: Notifications.SchedulableTriggerInputTypes.YEARLY,
        day: fireAnticipation.getDate(),
        month: fireAnticipation.getMonth(),
        hour: fireAnticipation.getHours(),
        minute: fireAnticipation.getMinutes(),
      },
      contentA,
      ANDROID_CHANNEL_ANTICIPATION
    );
    await scheduleWithTrigger(
      reminder,
      idS,
      {
        type: Notifications.SchedulableTriggerInputTypes.YEARLY,
        day: fireStart.getDate(),
        month: fireStart.getMonth(),
        hour: fireStart.getHours(),
        minute: fireStart.getMinutes(),
      },
      contentS,
      ANDROID_CHANNEL_EVENT_START
    );
  }
}

async function scheduleNativeStartOnly(reminder: Reminder, repeat: RepeatKind, fireStart: Date): Promise<void> {
  const idS = `agenda-s-${reminder.id}`;
  const contentS = buildStartContent(reminder);

  if (repeat === 'daily') {
    await scheduleWithTrigger(
      reminder,
      idS,
      {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: fireStart.getHours(),
        minute: fireStart.getMinutes(),
      },
      contentS,
      ANDROID_CHANNEL_EVENT_START
    );
    return;
  }
  if (repeat === 'weekly') {
    await scheduleWithTrigger(
      reminder,
      idS,
      {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: expoWeekdayFromDate(fireStart),
        hour: fireStart.getHours(),
        minute: fireStart.getMinutes(),
      },
      contentS,
      ANDROID_CHANNEL_EVENT_START
    );
    return;
  }
  if (repeat === 'monthly') {
    await scheduleWithTrigger(
      reminder,
      idS,
      {
        type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
        day: fireStart.getDate(),
        hour: fireStart.getHours(),
        minute: fireStart.getMinutes(),
      },
      contentS,
      ANDROID_CHANNEL_EVENT_START
    );
    return;
  }
  if (repeat === 'yearly') {
    await scheduleWithTrigger(
      reminder,
      idS,
      {
        type: Notifications.SchedulableTriggerInputTypes.YEARLY,
        day: fireStart.getDate(),
        month: fireStart.getMonth(),
        hour: fireStart.getHours(),
        minute: fireStart.getMinutes(),
      },
      contentS,
      ANDROID_CHANNEL_EVENT_START
    );
  }
}

/**
 * Cancela notificaciones previas del recordatorio; programa siempre la alarma a la hora de inicio
 * y, si "Activar alarma" está encendida, también la anticipación.
 */
export async function syncReminderNotification(reminder: Reminder): Promise<void> {
  if (!isNativeMobile()) return;

  await cancelNotificationsForReminder(reminder.id);

  if (reminder.noTime) return;

  const granted = await ensurePermissions();
  if (!granted) return;

  const wantsAnticipation = Boolean(reminder.alarm && reminder.alarmOffset != null);

  const repeat = reminder.repeat ?? 'none';
  const interval = Math.max(1, reminder.repeatInterval ?? 1);
  const endISO = reminder.repeatEndDate?.trim() || null;
  const now = Date.now();

  const useNativeRepeat = repeat !== 'none' && interval === 1 && endISO === null;

  if (useNativeRepeat) {
    const fireStart = eventStartLocal(reminder);
    try {
      if (wantsAnticipation) {
        const fireAnticipation = alarmFireLocal(reminder);
        await scheduleNativePair(reminder, repeat, fireAnticipation, fireStart);
      } else {
        await scheduleNativeStartOnly(reminder, repeat, fireStart);
      }
      return;
    } catch {
      /* disparos por fecha */
    }
  }

  let dateISO = reminder.date;
  let countA = 0;
  let countS = 0;
  let safety = 0;

  while ((countA < MAX_DATE_TRIGGERS || countS < MAX_DATE_TRIGGERS) && safety < 520) {
    safety++;
    if (endISO && dateISO > endISO) break;

    const [y, m, d] = dateISO.split('-').map(Number);
    const occStart = eventStartLocal({ ...reminder, date: dateISO });
    const anticipAt = wantsAnticipation
      ? new Date(occStart.getTime() - offsetToMs(reminder.alarmOffset!, reminder.alarmUnit ?? 'minutes'))
      : occStart;

    if (
      wantsAnticipation &&
      countA < MAX_DATE_TRIGGERS &&
      anticipAt.getTime() > now &&
      anticipAt.getTime() !== occStart.getTime()
    ) {
      try {
        await scheduleWithTrigger(
          reminder,
          `agenda-a-${reminder.id}-${countA}`,
          {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: anticipAt,
          },
          buildAnticipationContent(reminder),
          ANDROID_CHANNEL_ANTICIPATION
        );
        countA++;
      } catch {
        break;
      }
    }

    if (countS < MAX_DATE_TRIGGERS && occStart.getTime() > now) {
      try {
        await scheduleWithTrigger(
          reminder,
          `agenda-s-${reminder.id}-${countS}`,
          {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: occStart,
          },
          buildStartContent(reminder),
          ANDROID_CHANNEL_EVENT_START
        );
        countS++;
      } catch {
        break;
      }
    }

    if (repeat === 'none') break;
    dateISO = advanceDateISO(dateISO, repeat, interval);
  }
}
