/**
 * Notificaciones locales con Notifee — solo Android (dev build / prebuild; no Expo Go).
 * Siempre: aviso con alarma a la hora de inicio. Con "Activar alarma": además aviso de anticipación.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as IntentLauncher from "expo-intent-launcher";
import type {
  Event,
  Notification,
  TimestampTrigger,
} from "@notifee/react-native";
import {
  DeviceEventEmitter,
  NativeModules,
  Platform,
  AppState,
  type EmitterSubscription,
} from "react-native";
import type { Reminder } from "../types/reminder";
import { formatTime12h, getDayIndexFromDate } from "../utils/date";
import { isExpoGoEnvironment } from "../utils/expoEnvironment";
import {
  deleteReminder,
  getAllReminders,
  getReminderById,
} from "./reminderService";
import {
  clearAcksForReminder,
  isOccurrenceAcked,
  recordAlarmAck,
} from "./alarmAckService";
import { getAlarmBehaviorSettings } from "./alarmBehaviorService";

type NotifeeModule = typeof import("@notifee/react-native");

let notifeeBundle: NotifeeModule | null = null;
if (!isExpoGoEnvironment()) {
  try {
    notifeeBundle = require("@notifee/react-native") as NotifeeModule;
  } catch {
    notifeeBundle = null;
  }
}

const notifee = notifeeBundle?.default;
const AlarmType = notifeeBundle?.AlarmType;
const AndroidCategory = notifeeBundle?.AndroidCategory;
const AndroidFlags = notifeeBundle?.AndroidFlags;
const AndroidImportance = notifeeBundle?.AndroidImportance;
const AndroidNotificationSetting = notifeeBundle?.AndroidNotificationSetting;
const AndroidVisibility = notifeeBundle?.AndroidVisibility;
const AuthorizationStatus = notifeeBundle?.AuthorizationStatus;
const EventType = notifeeBundle?.EventType;
const RepeatFrequency = notifeeBundle?.RepeatFrequency;
const TriggerType = notifeeBundle?.TriggerType;

/** Emite al borrar un evento desde la notificación (Eliminar); la UI debe refrescar. */
export const REMINDER_DELETED_FROM_NOTIFICATION = "agenda:reminder-deleted";

/** Emite al pulsar "Reprogramar" en el aviso; la UI abre el modal de detalles de ese recordatorio. */
export const REMINDER_RESCHEDULE_FROM_NOTIFICATION =
  "agenda:reminder-reschedule";

/** Muestra la pantalla de alarma Palm a pantalla completa (app en primer plano). */
export const ALARM_RING_DISPLAY = "agenda:alarm-ring-display";

/** Cierra la pantalla de alarma Palm tras una acción del usuario o del aviso del sistema. */
export const ALARM_RING_DISMISSED = "agenda:alarm-ring-dismissed";

export type AlarmRingDisplayPayload = {
  notification: Notification;
};

/** Si "Reprogramar" llega antes de que la UI monte el listener (arranque en frío), se guarda aquí. */
let pendingRescheduleReminderId: string | null = null;

/** La UI lo consume al montar para abrir el modal aunque el evento se emitiera antes. */
export function consumePendingRescheduleReminderId(): string | null {
  const id = pendingRescheduleReminderId;
  pendingRescheduleReminderId = null;
  return id;
}

/** Puente nativo (AlarmLockscreenActivity → MainActivity → JS). */
const NATIVE_ALARM_BRIDGE = "agenda:alarm-bridge";

type NativeAlarmBridgePayload = {
  action: string;
  reminderId: string;
  alarmKind: "anticipation" | "start";
  notificationId: string;
  titleSnapshot: string;
  startTimeSnapshot: string;
  dateSnapshot: string;
};

/** Canal nativo de anticipación: mismo `raw/alert` y `USAGE_ALARM` que inicio (`AgendaSystemAlarmChannel` en prebuild). */
const ANDROID_CHANNEL_ANTICIPATION = "agenda-anticipation-phone-v5";
/** Canal nativo de inicio (`AgendaSystemAlarmChannel` en prebuild): `res/raw/alert` + IMPORTANCE_MAX. */
const ANDROID_CHANNEL_EVENT_START = "agenda-event-phone-v5";

const MAX_DATE_TRIGGERS = 32;
/** Notifee exige cantidad par de valores positivos; `[0, 400, …]` falla y degrada a notificación normal sin alarma. */
const ALARM_VIBRATION_PATTERN = [400, 200, 400, 200, 400, 200];
const ANDROID_EXACT_ALARM_PROMPT_KEY =
  "agenda_android_exact_alarm_settings_prompt_v1";
const ANDROID_EXTRA_APP_PACKAGE = "android.provider.extra.APP_PACKAGE";

/** Evita spam en consola si hay muchos recordatorios y alarmas exactas están desactivadas. */
let warnedExactAlarmDisabled = false;

/** Expo Go no incluye el binario nativo de Notifee como en `expo run:android`. */
let warnedExpoGoNotifications = false;

const ACTION_DEFAULT_PRESS = "DEFAULT_PRESS";
/** "Completado": tarea hecha → detiene el aviso y toda la cadena de re-sonido. */
const ACTION_OK = "OK";
const ACTION_DETENER = "DETENER";
/** Compat: avisos antiguos / lock-screen podían enviar ELIMINAR (borrar evento). */
const ACTION_ELIMINAR = "ELIMINAR";
/** "Recordarme": pospone 5 min y sigue insistiendo. */
const ACTION_POSPONER = "POSPONER";
/** "Reprogramar": abre la app en el modal de detalles para elegir nueva fecha/hora. */
const ACTION_REPROGRAMAR = "REPROGRAMAR";

function androidApiLevel(): number {
  if (Platform.OS !== "android") return 0;
  return typeof Platform.Version === "number"
    ? Platform.Version
    : parseInt(String(Platform.Version), 10) || 0;
}

function getAndroidPackageName(): string | undefined {
  return Constants.expoConfig?.android?.package;
}

export async function openAndroidAppNotificationSettings(): Promise<void> {
  if (Platform.OS !== "android") return;
  const pkg = getAndroidPackageName();
  if (!pkg) return;
  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.APP_NOTIFICATION_SETTINGS,
      {
        extra: { [ANDROID_EXTRA_APP_PACKAGE]: pkg },
      },
    );
  } catch {
    try {
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
        {
          data: `package:${pkg}`,
        },
      );
    } catch {
      /* OEM */
    }
  }
}

export async function openAndroidAppDetailsSettings(): Promise<void> {
  if (Platform.OS !== "android") return;
  const pkg = getAndroidPackageName();
  if (!pkg) return;
  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
      {
        data: `package:${pkg}`,
      },
    );
  } catch {
    /* */
  }
}

export async function openAndroidExactAlarmPermissionSettings(): Promise<void> {
  if (Platform.OS !== "android") return;
  const pkg = getAndroidPackageName();
  if (!pkg || androidApiLevel() < 31) return;
  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.REQUEST_SCHEDULE_EXACT_ALARM,
      {
        data: `package:${pkg}`,
      },
    );
  } catch {
    /* */
  }
}

export async function openAndroidManageFullScreenIntentSettings(): Promise<void> {
  if (Platform.OS !== "android") return;
  const pkg = getAndroidPackageName();
  if (!pkg || androidApiLevel() < 34) return;
  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.MANAGE_APP_USE_FULL_SCREEN_INTENT,
      {
        data: `package:${pkg}`,
      },
    );
  } catch {
    try {
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
        {
          data: `package:${pkg}`,
        },
      );
    } catch {
      /* OEM */
    }
  }
}

export type AndroidAlarmWakeDiagnostics = {
  /** POST_NOTIFICATIONS / permiso general de notificaciones */
  postNotificationsAuthorized: boolean;
  /** Programación con AlarmManager exacto (Android 12+); en API menores suele ser NOT_SUPPORTED */
  alarmSchedulingEnabled: boolean;
  androidApiLevel: number;
  /** Canal nativo de anticipación (`agenda-anticipation-phone-v5`, mismo audio que inicio) */
  anticipationChannelReady: boolean | null;
  /** Canal nativo de inicio (`agenda-event-phone-v5`) */
  startChannelReady: boolean | null;
  /** Notifee triggers pendientes (anticipación + inicio + pospuestos) */
  scheduledTriggerCount: number | null;
};

/**
 * Comprueba requisitos mínimos para que disparen alarmas con pantalla apagada / bloqueo.
 * No sustituye revisar Ajustes del sistema (batería, DND, pantalla completa en 14+).
 */
export async function getAndroidAlarmWakeDiagnostics(): Promise<AndroidAlarmWakeDiagnostics | null> {
  if (Platform.OS !== "android") return null;
  if (isExpoGoEnvironment() || !notifeeBundle) {
    return {
      postNotificationsAuthorized: false,
      alarmSchedulingEnabled: false,
      androidApiLevel: androidApiLevel(),
      anticipationChannelReady: null,
      startChannelReady: null,
      scheduledTriggerCount: null,
    };
  }
  await initLocalNotifications();
  const s = await notifee.getNotificationSettings();
  const alarm = s.android.alarm;
  const alarmSchedulingEnabled =
    alarm === AndroidNotificationSetting.NOT_SUPPORTED ||
    alarm === AndroidNotificationSetting.ENABLED;

  let anticipationChannelReady: boolean | null = null;
  let startChannelReady: boolean | null = null;
  let scheduledTriggerCount: number | null = null;
  try {
    const chA = await notifee.getChannel(ANDROID_CHANNEL_ANTICIPATION);
    anticipationChannelReady = chA != null;
    const chS = await notifee.getChannel(ANDROID_CHANNEL_EVENT_START);
    startChannelReady = chS != null;
    const triggers = await notifee.getTriggerNotifications();
    scheduledTriggerCount = triggers.length;
  } catch {
    /* Notifee no disponible o error nativo */
  }

  return {
    postNotificationsAuthorized: notificationAuthorized(s),
    alarmSchedulingEnabled,
    androidApiLevel: androidApiLevel(),
    anticipationChannelReady,
    startChannelReady,
    scheduledTriggerCount,
  };
}

async function maybeOpenAndroidExactAlarmSettingsOnce(): Promise<void> {
  if (Platform.OS !== "android") return;
  const api = androidApiLevel();
  if (api < 31) return;
  try {
    const done = await AsyncStorage.getItem(ANDROID_EXACT_ALARM_PROMPT_KEY);
    if (done === "1") return;
    const pkg = getAndroidPackageName();
    if (!pkg) return;
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.REQUEST_SCHEDULE_EXACT_ALARM,
      {
        data: `package:${pkg}`,
      },
    );
    await AsyncStorage.setItem(ANDROID_EXACT_ALARM_PROMPT_KEY, "1");
  } catch {
    /* */
  }
}

type AlarmNotifPayload = {
  reminderId: string;
  alarmKind: "anticipation" | "start";
  titleSnapshot: string;
  startTimeSnapshot: string;
  dateSnapshot: string;
};

function payloadFromReminder(
  reminder: Reminder,
  alarmKind: "anticipation" | "start",
): AlarmNotifPayload {
  return {
    reminderId: reminder.id,
    alarmKind,
    titleSnapshot: reminder.title?.trim() || "Evento",
    startTimeSnapshot: reminder.startTime,
    dateSnapshot: reminder.date,
  };
}

function toDataStrings(p: AlarmNotifPayload): Record<string, string> {
  return {
    reminderId: p.reminderId,
    alarmKind: p.alarmKind,
    titleSnapshot: p.titleSnapshot,
    startTimeSnapshot: p.startTimeSnapshot,
    dateSnapshot: p.dateSnapshot,
  };
}

function getAlarmLockscreenLaunchActivity(): string | undefined {
  const pkg = Constants.expoConfig?.android?.package;
  if (!pkg) return undefined;
  return `${pkg}.AlarmLockscreenActivity`;
}

function alarmKindFromNotificationData(
  n: Notification,
): "anticipation" | "start" {
  const k = n.data?.alarmKind;
  if (k === "anticipation" || k === "start") return k;
  return "start";
}

function primeNativeLockScreenPayload(
  reminder: Reminder,
  n: Notification,
  snoozeMinutes: number,
): void {
  const launch = getAlarmLockscreenLaunchActivity();
  if (!launch || Platform.OS !== "android") return;
  const mod = NativeModules.AgendaAlarmNative as
    | { primeLockScreenPayload?: (id: string, json: string) => void }
    | undefined;
  const id = n.id;
  if (!id || typeof mod?.primeLockScreenPayload !== "function") return;
  const kind = alarmKindFromNotificationData(n);
  const p = payloadFromReminder(reminder, kind);
  const payload = {
    ...p,
    displayTitle: n.title?.trim() || "Evento",
    displayBody: n.body ?? "",
    notificationId: id,
    snoozeMinutes,
  };
  try {
    mod.primeLockScreenPayload(id, JSON.stringify(payload));
  } catch {
    /* */
  }
}

let lastLockScreenPresentedId: string | null = null;
let lastLockScreenPresentedAt = 0;

function isAlarmKindNotification(n: Notification | undefined): boolean {
  const k = n?.data?.alarmKind;
  return k === "start" || k === "anticipation";
}

function emitAlarmRingDisplay(notification: Notification): void {
  DeviceEventEmitter.emit(ALARM_RING_DISPLAY, {
    notification,
  } satisfies AlarmRingDisplayPayload);
}

function emitAlarmRingDismissed(notificationId: string | undefined): void {
  if (!notificationId) return;
  DeviceEventEmitter.emit(ALARM_RING_DISMISSED, { notificationId });
}

/** Si fullScreenIntent está bloqueado, abrir AlarmLockscreenActivity al entregar la notificación. */
async function presentAlarmLockScreenIfNeeded(
  notification: Notification | undefined,
): Promise<void> {
  if (!isAndroidNotifications() || !notification?.id) return;
  if (!isAlarmKindNotification(notification)) return;

  const now = Date.now();
  if (
    lastLockScreenPresentedId === notification.id &&
    now - lastLockScreenPresentedAt < 4000
  ) {
    return;
  }

  const reminderId = notification.data?.reminderId;
  if (typeof reminderId === "string") {
    const r = await getReminderById(reminderId);
    if (r) {
      const behavior = await getAlarmBehaviorSettings();
      primeNativeLockScreenPayload(r, notification, behavior.snoozeMinutes);
    }
  }

  const foreground = AppState.currentState === "active";
  if (foreground) {
    emitAlarmRingDisplay(notification);
    lastLockScreenPresentedId = notification.id;
    lastLockScreenPresentedAt = now;
    return;
  }

  const mod = NativeModules.AgendaAlarmNative as
    | {
        primeLockScreenPayload?: (id: string, json: string) => void;
        launchLockScreenActivity?: () => void;
      }
    | undefined;
  if (typeof mod?.launchLockScreenActivity !== "function") {
    return;
  }

  try {
    mod.launchLockScreenActivity();
    lastLockScreenPresentedId = notification.id;
    lastLockScreenPresentedAt = now;
  } catch {
    /* */
  }
}

async function handleNativeAlarmBridge(ev: unknown): Promise<void> {
  if (!isAndroidNotifications()) return;
  if (isExpoGoEnvironment()) return;
  await initLocalNotifications();
  const o = ev as Partial<NativeAlarmBridgePayload>;
  const actionRaw = o.action;
  const reminderId = o.reminderId;
  const alarmKind = o.alarmKind;
  const notificationId = o.notificationId ?? "";
  if (typeof actionRaw !== "string" || typeof reminderId !== "string") return;
  if (alarmKind !== "anticipation" && alarmKind !== "start") return;

  const map: Record<string, string> = {
    OK: ACTION_OK,
    POSPONER: ACTION_POSPONER,
    ELIMINAR: ACTION_ELIMINAR,
    REPROGRAMAR: ACTION_REPROGRAMAR,
  };
  const actionId = map[actionRaw] ?? ACTION_OK;

  const notification: Notification = {
    id: notificationId || undefined,
    title: typeof o.titleSnapshot === "string" ? o.titleSnapshot : "Evento",
    body: "",
    data: toDataStrings({
      reminderId,
      alarmKind,
      titleSnapshot:
        typeof o.titleSnapshot === "string" ? o.titleSnapshot : "Evento",
      startTimeSnapshot:
        typeof o.startTimeSnapshot === "string" ? o.startTimeSnapshot : "09:00",
      dateSnapshot:
        typeof o.dateSnapshot === "string" ? o.dateSnapshot : "2000-01-01",
    }),
  };
  await handleAlarmInteraction(actionId, notification);
}

/** Registra el listener del puente nativo lo antes posible (p. ej. desde `index.ts`) para no perder eventos al arranque en frío. */
export function ensureAgendaAlarmBridgeListener(): void {
  if (!isAndroidNotifications() || isExpoGoEnvironment()) return;
  if (alarmBridgeSub) return;
  alarmBridgeSub = DeviceEventEmitter.addListener(
    NATIVE_ALARM_BRIDGE,
    (ev: unknown) => {
      void handleNativeAlarmBridge(ev);
    },
  );
}

function parseAlarmPayload(
  data: Record<string, unknown> | undefined,
): AlarmNotifPayload | null {
  if (!data || typeof data !== "object") return null;
  const reminderId = data.reminderId;
  const alarmKind = data.alarmKind;
  if (
    typeof reminderId !== "string" ||
    (alarmKind !== "anticipation" && alarmKind !== "start")
  ) {
    return null;
  }
  const titleSnapshot =
    typeof data.titleSnapshot === "string" ? data.titleSnapshot : "Evento";
  const startTimeSnapshot =
    typeof data.startTimeSnapshot === "string"
      ? data.startTimeSnapshot
      : "09:00";
  const dateSnapshot =
    typeof data.dateSnapshot === "string" ? data.dateSnapshot : "2000-01-01";
  return {
    reminderId,
    alarmKind,
    titleSnapshot,
    startTimeSnapshot,
    dateSnapshot,
  };
}

function normalizeActionId(raw: string | undefined): string {
  if (!raw) return "";
  return raw;
}

function isAlarmAction(actionId: string): boolean {
  return (
    actionId === ACTION_DEFAULT_PRESS ||
    actionId === ACTION_OK ||
    actionId === ACTION_DETENER ||
    actionId === ACTION_ELIMINAR ||
    actionId === ACTION_POSPONER ||
    actionId === ACTION_REPROGRAMAR
  );
}

async function dismissByNotificationId(
  notificationId: string | undefined,
): Promise<void> {
  if (!notificationId) return;
  try {
    await notifee.cancelNotification(notificationId);
  } catch {
    /* */
  }
}

/** Cancela triggers de anticipación principal (`agenda-a-{id}…`), no los pospuestos sueltos `agenda-ap-`. */
async function cancelAnticipationTriggerIdsForReminder(
  reminderId: string,
): Promise<void> {
  if (!isAndroidNotifications()) return;
  try {
    const triggers = await notifee.getTriggerNotifications();
    const prefix = `agenda-a-${reminderId}`;
    for (const t of triggers) {
      const tid = t.notification.id;
      if (!tid) continue;
      if (
        tid.startsWith(`agenda-ap-${reminderId}-`) ||
        tid === `agenda-ap-${reminderId}`
      )
        continue;
      if (!tid.startsWith(prefix)) continue;
      if (t.notification.data?.alarmKind !== "anticipation") continue;
      await notifee.cancelTriggerNotification(tid);
    }
  } catch {
    /* */
  }
}

/** Cancela triggers de inicio (`agenda-s-{id}…`) salvo pospuestos `agenda-p-`. */
async function cancelStartTriggerIdsForReminder(
  reminderId: string,
): Promise<void> {
  if (!isAndroidNotifications()) return;
  try {
    const triggers = await notifee.getTriggerNotifications();
    const prefix = `agenda-s-${reminderId}`;
    for (const t of triggers) {
      const tid = t.notification.id;
      if (!tid || !tid.startsWith(prefix) || isPostponeSnoozeIdentifier(tid))
        continue;
      if (t.notification.data?.alarmKind !== "start") continue;
      await notifee.cancelTriggerNotification(tid);
    }
  } catch {
    /* */
  }
}

async function recordAckFromPayload(
  payload: AlarmNotifPayload,
  kind: "completed" | "rescheduled",
): Promise<void> {
  await recordAlarmAck(
    payload.reminderId,
    payload.dateSnapshot,
    payload.startTimeSnapshot,
    kind,
  );
}

async function handleAlarmInteraction(
  actionId: string,
  notification: Notification | undefined,
): Promise<void> {
  const id = normalizeActionId(actionId);
  if (!isAlarmAction(id)) return;

  emitAlarmRingDismissed(notification?.id);

  const payload = parseAlarmPayload(
    notification?.data as Record<string, unknown> | undefined,
  );
  const nid = notification?.id;
  const behavior = await getAlarmBehaviorSettings();

  const isCompletado = id === ACTION_OK;
  const isReprogramar = id === ACTION_REPROGRAMAR;
  const isEliminar = id === ACTION_ELIMINAR;
  const isPosponer = id === ACTION_POSPONER;
  const isDismissOnly = id === ACTION_DETENER || id === ACTION_DEFAULT_PRESS;

  /** Completado y Reprogramar se comportan igual sea aviso de anticipación o de inicio. */
  if (payload && (isCompletado || isReprogramar)) {
    await recordAckFromPayload(
      payload,
      isReprogramar ? "rescheduled" : "completed",
    );
    // Detener este aviso y toda la cadena de re-sonido del recordatorio.
    await cancelNotificationsForReminder(payload.reminderId);
    if (isReprogramar) {
      pendingRescheduleReminderId = payload.reminderId;
      DeviceEventEmitter.emit(REMINDER_RESCHEDULE_FROM_NOTIFICATION, {
        reminderId: payload.reminderId,
      });
    }
    await dismissByNotificationId(nid);
    return;
  }

  if (payload?.alarmKind === "anticipation") {
    if (isEliminar) {
      await cancelNotificationsForReminder(payload.reminderId);
      await deleteReminder(payload.reminderId);
      await clearAcksForReminder(payload.reminderId);
      DeviceEventEmitter.emit(REMINDER_DELETED_FROM_NOTIFICATION, {
        reminderId: payload.reminderId,
      });
      await dismissByNotificationId(nid);
      return;
    }
    if (isPosponer) {
      const r = await getReminderById(payload.reminderId);
      if (r && !r.noTime) {
        try {
          await cancelAnticipationTriggerIdsForReminder(payload.reminderId);
          const when = new Date(Date.now() + behavior.snoozeMs);
          const postponeAntId = `agenda-ap-${r.id}-${Date.now()}`;
          await scheduleTrigger(
            r,
            postponeAntId,
            {
              type: TriggerType.TIMESTAMP,
              timestamp: when.getTime(),
              alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
            },
            buildAnticipationNotification(r, postponeAntId, {
              includeActions: true,
            }),
          );
        } catch (e) {
          console.warn("[Agenda] Error al posponer anticipación", e);
        }
      }
      await dismissByNotificationId(nid);
      return;
    }
    if (isDismissOnly) {
      await dismissByNotificationId(nid);
    }
    return;
  }

  if (!payload || payload.alarmKind !== "start") return;

  if (isEliminar) {
    await cancelNotificationsForReminder(payload.reminderId);
    await deleteReminder(payload.reminderId);
    await clearAcksForReminder(payload.reminderId);
    DeviceEventEmitter.emit(REMINDER_DELETED_FROM_NOTIFICATION, {
      reminderId: payload.reminderId,
    });
    await dismissByNotificationId(nid);
    return;
  }

  if (isPosponer) {
    const r = await getReminderById(payload.reminderId);
    if (r && !r.noTime) {
      try {
        await cancelStartTriggerIdsForReminder(payload.reminderId);
        const when = new Date(Date.now() + behavior.snoozeMs);
        const postponeId = `agenda-p-${r.id}-${Date.now()}`;
        await scheduleTrigger(
          r,
          postponeId,
          {
            type: TriggerType.TIMESTAMP,
            timestamp: when.getTime(),
            alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
          },
          buildStartNotification(r, postponeId, { includeActions: true }),
        );
      } catch (e) {
        console.warn("[Agenda] Error al posponer alarma de inicio", e);
      }
    }
    await dismissByNotificationId(nid);
    return;
  }

  if (isDismissOnly) {
    await dismissByNotificationId(nid);
  }
}

/** Acciones desde la pantalla de alarma Palm (Completado / posponer / reprogramar). */
export async function processAlarmRingUserAction(
  action: "complete" | "snooze" | "reschedule",
  notification: Notification | undefined,
): Promise<void> {
  const map = {
    complete: ACTION_OK,
    snooze: ACTION_POSPONER,
    reschedule: ACTION_REPROGRAMAR,
  } as const;
  await handleAlarmInteraction(map[action], notification);
}

/**
 * Llamado desde `notifeeBackground.ts` (headless JS). Debe resolver para que Notifee complete el evento.
 */
export async function handleNotifeeBackgroundEvent(
  event: Event,
): Promise<void> {
  if (Platform.OS !== "android") return;
  const { type, detail } = event;
  const { notification, pressAction } = detail;

  if (type === EventType.DELIVERED && notification) {
    await presentAlarmLockScreenIfNeeded(notification);
    return;
  }

  if (type === EventType.ACTION_PRESS && pressAction?.id) {
    await handleAlarmInteraction(pressAction.id, notification);
    return;
  }

  if (type === EventType.PRESS && pressAction?.id) {
    await handleAlarmInteraction(pressAction.id, notification);
    return;
  }

  if (type === EventType.DISMISSED && notification) {
    const payload = parseAlarmPayload(
      notification.data as Record<string, unknown> | undefined,
    );
    if (payload) {
      await recordAckFromPayload(payload, "completed");
    }
    await handleAlarmInteraction(ACTION_OK, notification);
  }
}

function isAndroidNotifications(): boolean {
  return Platform.OS === "android";
}

function offsetToMs(
  offset: number,
  unit: NonNullable<Reminder["alarmUnit"]>,
): number {
  switch (unit) {
    case "hours":
      return offset * 60 * 60 * 1000;
    case "days":
      return offset * 24 * 60 * 60 * 1000;
    default:
      return offset * 60 * 1000;
  }
}

function eventStartLocal(reminder: Reminder): Date {
  const [y, m, d] = reminder.date.split("-").map(Number);
  const [hh, mm] = reminder.startTime.split(":").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
}

function alarmFireLocal(reminder: Reminder): Date {
  const start = eventStartLocal(reminder);
  const offset = reminder.alarmOffset ?? 1;
  const unit = reminder.alarmUnit ?? "minutes";
  return new Date(start.getTime() - offsetToMs(offset, unit));
}

function pad2(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

function toDateISO(d: Date): string {
  return (
    d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate())
  );
}

function getEffectiveWeekdays(reminder: Reminder): number[] {
  if (reminder.repeatWeekdays?.length) {
    return [...reminder.repeatWeekdays].sort((a, b) => a - b);
  }
  return [getDayIndexFromDate(reminder.date)];
}

function mondayOfWeekISO(dateISO: string): string {
  const d = new Date(dateISO + "T12:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toDateISO(d);
}

function weeksBetweenMonday(anchorISO: string, currentISO: string): number {
  const a = new Date(mondayOfWeekISO(anchorISO) + "T12:00:00");
  const c = new Date(mondayOfWeekISO(currentISO) + "T12:00:00");
  return Math.round((c.getTime() - a.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

function nextWeeklyOccurrence(
  fromISO: string,
  weekdays: number[],
  interval: number,
  anchorISO: string,
): string {
  const d = new Date(fromISO + "T12:00:00");
  for (let safety = 0; safety < 366 * Math.max(1, interval); safety++) {
    d.setDate(d.getDate() + 1);
    const dateISO = toDateISO(d);
    const dayIdx = getDayIndexFromDate(dateISO);
    if (!weekdays.includes(dayIdx)) continue;
    if (interval === 1) return dateISO;
    const weeks = weeksBetweenMonday(anchorISO, dateISO);
    if (weeks >= 0 && weeks % interval === 0) return dateISO;
  }
  const fallback = new Date(fromISO + "T12:00:00");
  fallback.setDate(fallback.getDate() + 7 * interval);
  return toDateISO(fallback);
}

function advanceDateISO(
  dateISO: string,
  repeat: NonNullable<Reminder["repeat"]>,
  interval: number,
  reminder?: Reminder,
): string {
  if (repeat === "weekly" && reminder) {
    return nextWeeklyOccurrence(
      dateISO,
      getEffectiveWeekdays(reminder),
      interval,
      reminder.date,
    );
  }
  const d = new Date(dateISO + "T12:00:00");
  switch (repeat) {
    case "daily":
      d.setDate(d.getDate() + interval);
      break;
    case "weekly":
      d.setDate(d.getDate() + 7 * interval);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + interval);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + interval);
      break;
    default:
      return dateISO;
  }
  return toDateISO(d);
}

/** Domingo=1 … sábado=7 (como en el antiguo trigger semanal de Expo) */
function expoWeekdayFromDate(d: Date): number {
  return d.getDay() + 1;
}

function expoWeekdayToJsDay(weekdayExpo: number): number {
  return weekdayExpo === 7 ? 6 : weekdayExpo - 1;
}

/** Próxima ejecución diaria a hour:minute (>= from). */
function nextDailyTimestamp(
  hour: number,
  minute: number,
  fromMs: number,
): number {
  const base = new Date(fromMs);
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= base.getTime()) {
    d.setDate(d.getDate() + 1);
  }
  return d.getTime();
}

/** Próxima ejecución semanal (weekdayExpo 1–7) a hour:minute (>= from). */
function nextWeeklyTimestamp(
  weekdayExpo: number,
  hour: number,
  minute: number,
  fromMs: number,
): number {
  const targetDow = expoWeekdayToJsDay(weekdayExpo);
  const base = new Date(fromMs);
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  const current = base.getDay();
  let add = (targetDow - current + 7) % 7;
  if (add === 0 && d.getTime() <= base.getTime()) add = 7;
  d.setDate(d.getDate() + add);
  return d.getTime();
}

function androidAlarmTriggerBase(): Pick<TimestampTrigger, "alarmManager"> {
  return { alarmManager: { type: AlarmType.SET_ALARM_CLOCK } };
}

function formatNotifeeScheduleError(e: unknown): string {
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const native = o.nativeErrorMessage ?? o.nativeErrorCode;
    if (native != null) return `${o.message ?? "Error"} (${String(native)})`;
    if (typeof o.message === "string") return o.message;
  }
  return String(e);
}

/**
 * Quita solo full-screen intent (suele fallar sin permiso en API 34+).
 * Mantiene acciones, `lightUpScreen`, categoría alarma y vibración para que sigan visibles los botones y el intento de encender pantalla.
 */
function stripFullScreenIntentOnly(n: Notification): Notification {
  const a = n.android ? { ...n.android } : undefined;
  if (!a) return n;
  const next = { ...a };
  delete (next as { fullScreenAction?: unknown }).fullScreenAction;
  if (!next.pressAction) {
    next.pressAction = { id: ACTION_DEFAULT_PRESS, launchActivity: "default" };
  }
  return { ...n, android: next };
}

/** Quita solo acciones rápidas; mantiene fullScreen, lightUpScreen y categoría alarma. */
function stripActionsOnly(n: Notification): Notification {
  const a = n.android ? { ...n.android } : undefined;
  if (!a) return n;
  const next = { ...a };
  delete (next as { actions?: unknown }).actions;
  return { ...n, android: next };
}

/**
 * Refuerzo de despertar / alarma: sonido insistente, tono en bucle, timestamp visible.
 * En API menores a 26 fuerza importancia alta (sin canales).
 */
function withAlarmWakeBoost(n: Notification, fireAtMs?: number): Notification {
  const a = n.android ? { ...n.android } : undefined;
  if (!a) return n;
  const prevFlags = a.flags ?? [];
  const merged = [...prevFlags];
  if (!merged.includes(AndroidFlags.FLAG_INSISTENT)) {
    merged.push(AndroidFlags.FLAG_INSISTENT);
  }
  const api = androidApiLevel();
  const next: Notification["android"] = {
    ...a,
    flags: merged,
    loopSound: true,
    ...(api > 0 && api < 26 ? { importance: AndroidImportance.HIGH } : {}),
    ...(typeof fireAtMs === "number" && fireAtMs > 0
      ? { showTimestamp: true, timestamp: fireAtMs }
      : {}),
  };
  return { ...n, android: next };
}

function stripFullScreenAndActionsKeepWakeUi(n: Notification): Notification {
  return stripActionsOnly(stripFullScreenIntentOnly(n));
}

function triggerFireTimestampMs(trigger: TimestampTrigger): number | undefined {
  if (trigger.type !== TriggerType.TIMESTAMP) return undefined;
  return typeof trigger.timestamp === "number" ? trigger.timestamp : undefined;
}

/**
 * Último recurso si aún falla `createTriggerNotification` (API / OEM).
 * Prioriza que exista disparador; quita acciones, `lightUpScreen` e insistencia para maximizar compatibilidad.
 */
function stripHeavyAlarmAndroidUi(n: Notification): Notification {
  const a = n.android ? { ...n.android } : undefined;
  if (!a) return n;
  const next = { ...a };
  delete (next as { fullScreenAction?: unknown }).fullScreenAction;
  delete (next as { lightUpScreen?: unknown }).lightUpScreen;
  delete (next as { actions?: unknown }).actions;
  delete (next as { vibrationPattern?: unknown }).vibrationPattern;
  delete (next as { lights?: unknown }).lights;
  delete (next as { loopSound?: unknown }).loopSound;
  if (Array.isArray(next.flags)) {
    next.flags = next.flags.filter((f) => f !== AndroidFlags.FLAG_INSISTENT);
    if (next.flags.length === 0) delete (next as { flags?: unknown }).flags;
  }
  next.ongoing = false;
  next.category = undefined;
  if (!next.pressAction) {
    next.pressAction = { id: ACTION_DEFAULT_PRESS, launchActivity: "default" };
  }
  return { ...n, android: next };
}

function workManagerTimestampTrigger(from: TimestampTrigger): TimestampTrigger {
  return {
    type: TriggerType.TIMESTAMP,
    timestamp: from.timestamp,
    ...(from.repeatFrequency != null
      ? { repeatFrequency: from.repeatFrequency }
      : {}),
  };
}

function notificationAuthorized(settings: {
  authorizationStatus: AuthorizationStatus;
}): boolean {
  return (
    settings.authorizationStatus === AuthorizationStatus.AUTHORIZED ||
    settings.authorizationStatus === AuthorizationStatus.PROVISIONAL
  );
}

type BuildNotifOpts = { includeActions?: boolean };

function buildAnticipationNotification(
  reminder: Reminder,
  id: string,
  opts?: BuildNotifOpts,
): Notification {
  const lockLa = getAlarmLockscreenLaunchActivity();
  const when = reminder.allDay
    ? `todo el día · ${formatTime12h(reminder.startTime)}`
    : formatTime12h(reminder.startTime);
  const p = payloadFromReminder(reminder, "anticipation");
  const body = `Recordatorio antes del inicio · ${when}`;
  const base: Notification = {
    id,
    title: reminder.title?.trim() || "Evento",
    body,
    data: toDataStrings(p),
    android: {
      channelId: ANDROID_CHANNEL_ANTICIPATION,
      category: AndroidCategory.ALARM,
      /** Hasta que el usuario pulse Ok (u otra acción); no afecta "Limpiar todo" y suele impedir el cierre con X. */
      ongoing: true,
      autoCancel: false,
      visibility: AndroidVisibility.PUBLIC,
      pressAction: lockLa
        ? { id: ACTION_DEFAULT_PRESS, launchActivity: lockLa }
        : { id: ACTION_DEFAULT_PRESS, launchActivity: "default" },
      fullScreenAction: lockLa
        ? { id: "agenda_fs_anticipation", launchActivity: lockLa }
        : { id: "agenda_fs_anticipation", launchActivity: "default" },
      vibrationPattern: ALARM_VIBRATION_PATTERN,
      lights: ["#00FFFF", 300, 300],
      lightUpScreen: true,
      ...(opts?.includeActions !== false
        ? {
            actions: [
              { title: "Completado", pressAction: { id: ACTION_OK } },
              {
                title: "Reprogramar",
                pressAction: {
                  id: ACTION_REPROGRAMAR,
                  launchActivity: "default",
                },
              },
              {
                title: "Recordar nuevamente",
                pressAction: { id: ACTION_POSPONER, launchActivity: "default" },
              },
            ],
          }
        : {}),
    },
  };
  return base;
}

function buildStartNotification(
  reminder: Reminder,
  id: string,
  opts?: BuildNotifOpts,
): Notification {
  const lockLa = getAlarmLockscreenLaunchActivity();
  const body = reminder.allDay
    ? `Todo el día · ${formatTime12h(reminder.startTime)}`
    : `Empieza ahora · ${formatTime12h(reminder.startTime)}`;
  const p = payloadFromReminder(reminder, "start");
  const actions =
    opts?.includeActions === false
      ? undefined
      : [
          { title: "Completado", pressAction: { id: ACTION_OK } },
          {
            title: "Reprogramar",
            pressAction: { id: ACTION_REPROGRAMAR, launchActivity: "default" },
          },
          {
            title: "Recordar nuevamente",
            pressAction: { id: ACTION_POSPONER, launchActivity: "default" },
          },
        ];
  return {
    id,
    title: reminder.title?.trim() || "Evento",
    body,
    data: toDataStrings(p),
    android: {
      channelId: ANDROID_CHANNEL_EVENT_START,
      category: AndroidCategory.ALARM,
      /** Persistente hasta Ok / Eliminar / Posponer. */
      ongoing: true,
      autoCancel: false,
      visibility: AndroidVisibility.PUBLIC,
      pressAction: lockLa
        ? { id: ACTION_DEFAULT_PRESS, launchActivity: lockLa }
        : { id: ACTION_DEFAULT_PRESS, launchActivity: "default" },
      fullScreenAction: lockLa
        ? { id: "agenda_fs", launchActivity: lockLa }
        : { id: "agenda_fs", launchActivity: "default" },
      vibrationPattern: ALARM_VIBRATION_PATTERN,
      lights: ["#00FFFF", 300, 300],
      lightUpScreen: true,
      actions,
    },
  };
}

let foregroundUnsub: (() => void) | null = null;
let alarmBridgeSub: EmitterSubscription | null = null;

/** Una sola ejecución por proceso: evita borrar canales dos veces y deja listo Notifee antes de `sync`. */
let localNotificationsInitPromise: Promise<void> | null = null;

/**
 * Inicio y anticipación se crean en Kotlin con el mismo URI de sonido; aquí solo comprobamos que Notifee los vea.
 */
async function ensureNativeAlarmChannelsVisible(): Promise<void> {
  try {
    const start = await notifee.getChannel(ANDROID_CHANNEL_EVENT_START);
    const ant = await notifee.getChannel(ANDROID_CHANNEL_ANTICIPATION);
    if (start == null || ant == null) {
      console.warn(
        "[Agenda] Canales nativos de alarma incompletos (inicio o anticipación). Aplica prebuild / reinstala la app para regenerar AgendaSystemAlarmChannel.kt (SCHEMA 6).",
      );
    }
  } catch {
    /* */
  }
}

export async function initLocalNotifications(): Promise<void> {
  if (!isAndroidNotifications()) return;
  if (isExpoGoEnvironment()) {
    if (!warnedExpoGoNotifications) {
      warnedExpoGoNotifications = true;
      console.warn(
        "[Agenda] Expo Go no ejecuta Notifee nativo. Instala la app con `npx expo run:android` para probar alarmas.",
      );
    }
    return;
  }
  if (!localNotificationsInitPromise) {
    localNotificationsInitPromise = performInitLocalNotifications();
  }
  await localNotificationsInitPromise;
}

async function performInitLocalNotifications(): Promise<void> {
  try {
    if (foregroundUnsub) {
      foregroundUnsub();
      foregroundUnsub = null;
    }
    ensureAgendaAlarmBridgeListener();
    foregroundUnsub = notifee.onForegroundEvent(({ type, detail }) => {
      const { notification, pressAction } = detail;
      if (type === EventType.DELIVERED && notification) {
        void presentAlarmLockScreenIfNeeded(notification);
        return;
      }
      if (type === EventType.ACTION_PRESS && pressAction?.id) {
        void handleAlarmInteraction(pressAction.id, notification);
        return;
      }
      if (type === EventType.PRESS && pressAction?.id) {
        void handleAlarmInteraction(pressAction.id, notification);
        return;
      }
      if (type === EventType.DISMISSED && notification) {
        void handleAlarmInteraction(ACTION_OK, notification);
      }
    });

    try {
      const initial = await notifee.getInitialNotification();
      if (
        initial?.pressAction?.id &&
        isAlarmAction(normalizeActionId(initial.pressAction.id))
      ) {
        await handleAlarmInteraction(
          initial.pressAction.id,
          initial.notification,
        );
      }
    } catch {
      /* */
    }

    for (const oldId of [
      "agenda-anticipation",
      "agenda-anticipation-alert",
      "agenda-anticipation-v4",
    ] as const) {
      try {
        await notifee.deleteChannel(oldId);
      } catch {
        /* */
      }
    }

    for (const oldId of [
      "agenda-event-start",
      "agenda-event-alarm",
      "agenda-event-phone-alarm",
      "agenda-event-phone-alarm-v4",
    ] as const) {
      try {
        await notifee.deleteChannel(oldId);
      } catch {
        /* */
      }
    }

    await ensureNativeAlarmChannelsVisible();

    setTimeout(() => {
      void maybeOpenAndroidExactAlarmSettingsOnce();
    }, 2500);
  } catch (e) {
    console.warn("[Agenda] initLocalNotifications falló", e);
  }
}

async function ensurePermissions(): Promise<boolean> {
  if (!isAndroidNotifications()) return false;
  let settings = await notifee.getNotificationSettings();

  if (!notificationAuthorized(settings)) {
    const req = await notifee.requestPermission({
      alert: true,
      badge: true,
      sound: true,
    });
    if (!notificationAuthorized(req)) {
      console.warn(
        "[Agenda] Permiso de notificaciones no concedido (estado:",
        req.authorizationStatus,
        "). Sin él no se programan alarmas.",
      );
      return false;
    }
    settings = await notifee.getNotificationSettings();
  }

  if (!notificationAuthorized(settings)) {
    return false;
  }

  const api = androidApiLevel();
  if (
    api >= 31 &&
    settings.android.alarm === AndroidNotificationSetting.DISABLED &&
    !warnedExactAlarmDisabled
  ) {
    warnedExactAlarmDisabled = true;
    console.warn(
      "[Agenda] Alarmas exactas desactivadas para esta app; en Ajustes permite alarmas y recordatorios para que disparen a la hora (el init también puede abrir esa pantalla una vez).",
    );
  }
  return true;
}

export async function cancelNotificationsForReminder(
  reminderId: string,
): Promise<void> {
  if (!isAndroidNotifications()) return;
  try {
    const triggers = await notifee.getTriggerNotifications();
    for (const t of triggers) {
      const rid = t.notification.data?.reminderId;
      if (rid === reminderId && t.notification.id) {
        await notifee.cancelTriggerNotification(t.notification.id);
      }
    }
    const displayed = await notifee.getDisplayedNotifications();
    for (const d of displayed) {
      const rid = d.notification.data?.reminderId;
      if (rid === reminderId && d.id) {
        await notifee.cancelDisplayedNotification(d.id);
      }
    }
  } catch {
    /* */
  }
}

function isPostponeSnoozeIdentifier(identifier: string): boolean {
  return (
    identifier.startsWith("agenda-p-") || identifier.startsWith("agenda-ap-")
  );
}

async function cancelMainScheduledNotificationsForReminder(
  reminderId: string,
): Promise<void> {
  if (!isAndroidNotifications()) return;
  try {
    const triggers = await notifee.getTriggerNotifications();
    for (const t of triggers) {
      const id = t.notification.id;
      if (!id || isPostponeSnoozeIdentifier(id)) continue;
      const rid = t.notification.data?.reminderId;
      if (rid === reminderId) {
        await notifee.cancelTriggerNotification(id);
      }
    }
  } catch {
    /* */
  }
}

async function scheduleTrigger(
  reminder: Reminder,
  identifier: string,
  trigger: TimestampTrigger,
  notification: Notification,
): Promise<void> {
  void identifier;
  const fireMs = triggerFireTimestampMs(trigger);
  const base = withAlarmWakeBoost(notification, fireMs);
  const behavior = await getAlarmBehaviorSettings();
  primeNativeLockScreenPayload(reminder, base, behavior.snoozeMinutes);
  const attempts: Array<{
    label: string;
    n: Notification;
    t: TimestampTrigger;
  }> = [
    { label: "alarm_clock+ui_completa", n: base, t: trigger },
    {
      label: "alarm_clock+sin_fullscreen",
      n: withAlarmWakeBoost(stripFullScreenIntentOnly(base), fireMs),
      t: trigger,
    },
    {
      label: "alarm_clock+sin_acciones",
      n: withAlarmWakeBoost(stripActionsOnly(base), fireMs),
      t: trigger,
    },
    {
      label: "alarm_clock+sin_fs_sin_acciones",
      n: withAlarmWakeBoost(stripFullScreenAndActionsKeepWakeUi(base), fireMs),
      t: trigger,
    },
    {
      label: "workmanager+sin_fullscreen",
      n: withAlarmWakeBoost(stripFullScreenIntentOnly(base), fireMs),
      t: workManagerTimestampTrigger(trigger),
    },
    {
      label: "alarm_clock+ui_minima",
      n: stripHeavyAlarmAndroidUi(base),
      t: trigger,
    },
    {
      label: "workmanager+ui_minima",
      n: stripHeavyAlarmAndroidUi(base),
      t: workManagerTimestampTrigger(trigger),
    },
  ];

  let lastErr: unknown;
  for (const att of attempts) {
    try {
      await notifee.createTriggerNotification(att.n, att.t);
      if (att.label !== "alarm_clock+ui_completa") {
        console.warn(
          `[Agenda] Alarma programada vía "${att.label}" (id ${notification.id ?? "?"})`,
        );
      }
      return;
    } catch (e) {
      lastErr = e;
      console.warn(
        `[Agenda] createTriggerNotification [${att.label}]: ${formatNotifeeScheduleError(e)}`,
      );
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(formatNotifeeScheduleError(lastErr));
}

type RepeatKind = NonNullable<Reminder["repeat"]>;

async function scheduleNativePair(
  reminder: Reminder,
  repeat: RepeatKind,
  fireAnticipation: Date,
  fireStart: Date,
): Promise<boolean> {
  const idA = `agenda-a-${reminder.id}`;
  const idS = `agenda-s-${reminder.id}`;
  const now = Date.now();

  const safeSchedule = async (fn: () => Promise<void>): Promise<boolean> => {
    try {
      await fn();
      return true;
    } catch (e) {
      console.warn("[Agenda] Error al programar notificación local", e);
      return false;
    }
  };

  if (repeat === "daily") {
    const tsStart = nextDailyTimestamp(
      fireStart.getHours(),
      fireStart.getMinutes(),
      now,
    );
    const tsAnt = nextDailyTimestamp(
      fireAnticipation.getHours(),
      fireAnticipation.getMinutes(),
      now,
    );
    const trigStart: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: tsStart,
      repeatFrequency: RepeatFrequency.DAILY,
      ...androidAlarmTriggerBase(),
    };
    const trigAnt: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: tsAnt,
      repeatFrequency: RepeatFrequency.DAILY,
      ...androidAlarmTriggerBase(),
    };
    const okStart = await safeSchedule(() =>
      scheduleTrigger(
        reminder,
        idS,
        trigStart,
        buildStartNotification(reminder, idS),
      ),
    );
    const okAnt = await safeSchedule(() =>
      scheduleTrigger(
        reminder,
        idA,
        trigAnt,
        buildAnticipationNotification(reminder, idA, { includeActions: true }),
      ),
    );
    return okStart && okAnt;
  }

  if (repeat === "weekly") {
    const wS = expoWeekdayFromDate(fireStart);
    const wA = expoWeekdayFromDate(fireAnticipation);
    const tsStart = nextWeeklyTimestamp(
      wS,
      fireStart.getHours(),
      fireStart.getMinutes(),
      now,
    );
    const tsAnt = nextWeeklyTimestamp(
      wA,
      fireAnticipation.getHours(),
      fireAnticipation.getMinutes(),
      now,
    );
    const trigStart: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: tsStart,
      repeatFrequency: RepeatFrequency.WEEKLY,
      ...androidAlarmTriggerBase(),
    };
    const trigAnt: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: tsAnt,
      repeatFrequency: RepeatFrequency.WEEKLY,
      ...androidAlarmTriggerBase(),
    };
    const okStart = await safeSchedule(() =>
      scheduleTrigger(
        reminder,
        idS,
        trigStart,
        buildStartNotification(reminder, idS),
      ),
    );
    const okAnt = await safeSchedule(() =>
      scheduleTrigger(
        reminder,
        idA,
        trigAnt,
        buildAnticipationNotification(reminder, idA, { includeActions: true }),
      ),
    );
    return okStart && okAnt;
  }

  return false;
}

async function scheduleNativeStartOnly(
  reminder: Reminder,
  repeat: RepeatKind,
  fireStart: Date,
): Promise<void> {
  const idS = `agenda-s-${reminder.id}`;
  const now = Date.now();

  if (repeat === "daily") {
    const ts = nextDailyTimestamp(
      fireStart.getHours(),
      fireStart.getMinutes(),
      now,
    );
    const trig: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: ts,
      repeatFrequency: RepeatFrequency.DAILY,
      ...androidAlarmTriggerBase(),
    };
    await scheduleTrigger(
      reminder,
      idS,
      trig,
      buildStartNotification(reminder, idS),
    );
    return;
  }
  if (repeat === "weekly") {
    const w = expoWeekdayFromDate(fireStart);
    const ts = nextWeeklyTimestamp(
      w,
      fireStart.getHours(),
      fireStart.getMinutes(),
      now,
    );
    const trig: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: ts,
      repeatFrequency: RepeatFrequency.WEEKLY,
      ...androidAlarmTriggerBase(),
    };
    await scheduleTrigger(
      reminder,
      idS,
      trig,
      buildStartNotification(reminder, idS),
    );
  }
}

/**
 * Re-sonido automático: si no se responde, vuelve a sonar según preferencias globales.
 * Solo para el próximo disparo de cada tipo (no para cada repetición futura lejana).
 */
async function scheduleRepeatRings(
  reminder: Reminder,
  firstFireMs: number,
  kind: "start" | "anticipation",
): Promise<void> {
  const behavior = await getAlarmBehaviorSettings();
  if (behavior.repeatCount <= 0) return;
  const now = Date.now();
  const prefix =
    kind === "start" ? `agenda-s-${reminder.id}` : `agenda-a-${reminder.id}`;
  const build =
    kind === "start"
      ? (id: string) => buildStartNotification(reminder, id)
      : (id: string) =>
          buildAnticipationNotification(reminder, id, { includeActions: true });
  for (let n = 1; n <= behavior.repeatCount; n++) {
    const fireMs = firstFireMs + n * behavior.repeatIntervalMs;
    if (fireMs <= now) continue;
    const id = `${prefix}-ring${n}`;
    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: fireMs,
      ...androidAlarmTriggerBase(),
    };
    try {
      await scheduleTrigger(reminder, id, trigger, build(id));
    } catch (e) {
      console.warn("[Agenda] Error al programar re-sonido de alarma", e);
    }
  }
}

export type SyncReminderNotificationOptions = {
  preservePostponeSnoozes?: boolean;
};

export async function syncReminderNotification(
  reminder: Reminder,
  options?: SyncReminderNotificationOptions,
): Promise<void> {
  if (!isAndroidNotifications()) return;

  if (isExpoGoEnvironment()) {
    if (!warnedExpoGoNotifications) {
      warnedExpoGoNotifications = true;
      console.warn(
        "[Agenda] Las alarmas no están disponibles en Expo Go. Genera e instala la app con `npx expo run:android`.",
      );
    }
    return;
  }

  /** Canales + listener; idempotente. Evita guardar un evento antes de que acabe el init del montaje. */
  await initLocalNotifications();
  await ensureNativeAlarmChannelsVisible();

  if (options?.preservePostponeSnoozes) {
    await cancelMainScheduledNotificationsForReminder(reminder.id);
  } else {
    await cancelNotificationsForReminder(reminder.id);
  }

  if (reminder.noTime) {
    return;
  }

  const granted = await ensurePermissions();
  if (!granted) {
    console.warn(
      "[Agenda] Sin permiso de notificaciones no se pueden programar alarmas. Acepta el permiso o actívalo en Ajustes.",
    );
    return;
  }

  const wantsAnticipation = Boolean(
    reminder.alarm && reminder.alarmOffset != null,
  );

  const repeat = reminder.repeat ?? "none";
  const interval = Math.max(1, reminder.repeatInterval ?? 1);
  const endISO = reminder.repeatEndDate?.trim() || null;
  const now = Date.now();
  const effectiveWeekdays =
    repeat === "weekly" ? getEffectiveWeekdays(reminder) : [];

  const useNativeRepeat =
    repeat !== "none" &&
    interval === 1 &&
    endISO === null &&
    (repeat === "daily" ||
      (repeat === "weekly" && effectiveWeekdays.length === 1));

  if (useNativeRepeat) {
    const fireStart = eventStartLocal(reminder);
    const nextTs =
      repeat === "daily"
        ? nextDailyTimestamp(fireStart.getHours(), fireStart.getMinutes(), now)
        : nextWeeklyTimestamp(
            expoWeekdayFromDate(fireStart),
            fireStart.getHours(),
            fireStart.getMinutes(),
            now,
          );
    const nextDateISO = toDateISO(new Date(nextTs));
    const nextAcked = await isOccurrenceAcked(
      reminder.id,
      nextDateISO,
      reminder.startTime,
    );
    if (!nextAcked) {
      if (wantsAnticipation) {
        const fireAnticipation = alarmFireLocal(reminder);
        const nativeOk = await scheduleNativePair(
          reminder,
          repeat,
          fireAnticipation,
          fireStart,
        );
        if (nativeOk) {
          return;
        }
      } else {
        try {
          await scheduleNativeStartOnly(reminder, repeat, fireStart);
          return;
        } catch {
          /* fechas */
        }
      }
    }
  }

  let dateISO = reminder.date;
  let countA = 0;
  let countS = 0;
  let safety = 0;
  let firstStartRingsScheduled = false;
  let firstAnticipationRingsScheduled = false;

  while (
    (countA < MAX_DATE_TRIGGERS || countS < MAX_DATE_TRIGGERS) &&
    safety < 520
  ) {
    safety++;
    if (endISO && dateISO > endISO) break;

    const occStart = eventStartLocal({ ...reminder, date: dateISO });
    const anticipAt = wantsAnticipation
      ? new Date(
          occStart.getTime() -
            offsetToMs(reminder.alarmOffset!, reminder.alarmUnit ?? "minutes"),
        )
      : occStart;

    const occurrenceAcked = await isOccurrenceAcked(
      reminder.id,
      dateISO,
      reminder.startTime,
    );
    if (occurrenceAcked) {
      if (repeat === "none") break;
      dateISO = advanceDateISO(dateISO, repeat, interval, reminder);
      continue;
    }

    if (
      !occurrenceAcked &&
      countS < MAX_DATE_TRIGGERS &&
      occStart.getTime() > now
    ) {
      try {
        const id = `agenda-s-${reminder.id}-${countS}`;
        const trigger: TimestampTrigger = {
          type: TriggerType.TIMESTAMP,
          timestamp: occStart.getTime(),
          ...androidAlarmTriggerBase(),
        };
        await scheduleTrigger(
          reminder,
          id,
          trigger,
          buildStartNotification(reminder, id),
        );
        countS++;
        if (!firstStartRingsScheduled) {
          firstStartRingsScheduled = true;
          await scheduleRepeatRings(reminder, occStart.getTime(), "start");
        }
      } catch (e) {
        console.warn(
          "[Agenda] Error al programar notificación de inicio de evento",
          e,
        );
      }
    }

    if (
      !occurrenceAcked &&
      wantsAnticipation &&
      countA < MAX_DATE_TRIGGERS &&
      anticipAt.getTime() > now &&
      anticipAt.getTime() !== occStart.getTime()
    ) {
      try {
        const id = `agenda-a-${reminder.id}-${countA}`;
        const trigger: TimestampTrigger = {
          type: TriggerType.TIMESTAMP,
          timestamp: anticipAt.getTime(),
          ...androidAlarmTriggerBase(),
        };
        await scheduleTrigger(
          reminder,
          id,
          trigger,
          buildAnticipationNotification(reminder, id, { includeActions: true }),
        );
        countA++;
        if (!firstAnticipationRingsScheduled) {
          firstAnticipationRingsScheduled = true;
          await scheduleRepeatRings(
            reminder,
            anticipAt.getTime(),
            "anticipation",
          );
        }
      } catch (e) {
        console.warn(
          "[Agenda] Error al programar notificación de anticipación",
          e,
        );
      }
    }

    if (repeat === "none") break;
    dateISO = advanceDateISO(dateISO, repeat, interval, reminder);
  }
}

export async function resyncAllScheduledNotifications(): Promise<void> {
  if (!isAndroidNotifications()) return;
  const all = await getAllReminders();
  await Promise.all(
    all.map((r) =>
      syncReminderNotification(r, { preservePostponeSnoozes: true }),
    ),
  );
}
