/**
 * Pantalla principal de la agenda diaria.
 * Compone el header (fecha y selector de día), el área de franjas horarias con recordatorios y el footer.
 * Gestiona el CRUD de recordatorios (crear, editar, eliminar) y la fecha seleccionada.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { DeviceEventEmitter, View, Text, TouchableOpacity, StyleSheet, Alert, Keyboard, Platform, InteractionManager, AppState } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AgendaHeader, AgendaSchedule, AgendaFooter, WeekView, MonthView, DaySummaryView, GoToDateScreen, EventDetailsModal, AlarmRingScreen } from '../components';
import { AgendaNavBar, useAgendaNavStyles } from '../components/AgendaNavBar';
import { OptionsScreen } from './OptionsScreen';
import { ScreenOverlay } from '../components/PalmScreenShell';
import { usePreferences } from '../contexts/PreferencesContext';
import type { AgendaViewTab } from '../types/agenda';
import type { Reminder, CreateReminderInput, UpdateReminderInput } from '../types/reminder';
import { buildHoursLabelsWithOptional30 } from '../utils/scheduleHours';
import {
  formatDisplayDate,
  formatWeekMonthYearRange,
  getWeekNumber,
  getSundayOfWeek,
  getDayIndexFromDate,
  getTodayISO,
  getDateForDayIndexInWeek,
  addDays,
  getWeekDates,
} from '../utils/date';
import { slotLabelTo24H } from '../constants/agenda';
import {
  getRemindersByDate,
  getAllReminders,
  getReminderById,
  createReminder,
  updateReminder,
  deleteReminder,
  addHour,
} from '../services/reminderService';
import {
  initLocalNotifications,
  syncReminderNotification,
  cancelNotificationsForReminder,
  REMINDER_DELETED_FROM_NOTIFICATION,
  REMINDER_RESCHEDULE_FROM_NOTIFICATION,
  ALARM_RING_DISPLAY,
  ALARM_RING_DISMISSED,
  processAlarmRingUserAction,
  type AlarmRingDisplayPayload,
  consumePendingRescheduleReminderId,
  resyncAllScheduledNotifications,
} from '../services/localNotificationService';
import type { Notification } from '@notifee/react-native';
import { clearAcksForReminder } from '../services/alarmAckService';
import { runStartupPermissionFlow } from '../services/startupPermissionsService';
import { getDaySchedule } from '../services/dayScheduleService';

/** Minutos desde medianoche para alinear el scroll del día tras crear un evento. */
function startTimeToScrollMinutes(startTime: string): number {
  const parts = startTime.split(':');
  const h = parseInt(parts[0] ?? '0', 10);
  const m = parseInt(parts[1] ?? '0', 10);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function AgendaScreen() {
  const insets = useSafeAreaInsets();
  const { preferences, colors } = usePreferences();
  const navStyles = useAgendaNavStyles();
  const [keyboardPad, setKeyboardPad] = useState(0);
  const [selectedDate, setSelectedDate] = useState(getTodayISO());
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<AgendaViewTab>('day');
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [detailsDefaultStartTime, setDetailsDefaultStartTime] = useState<string | undefined>(undefined);
  const [detailsDefaultTitle, setDetailsDefaultTitle] = useState('');
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [weekReminders, setWeekReminders] = useState<Reminder[]>([]);
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const [monthReminders, setMonthReminders] = useState<Reminder[]>([]);
  const [goToDateVisible, setGoToDateVisible] = useState(false);
  const [goToDateMonthAnchor, setGoToDateMonthAnchor] = useState<Date | null>(null);
  const [goToDateReminders, setGoToDateReminders] = useState<Reminder[]>([]);
  const [selectedReminder, setSelectedReminder] = useState<Reminder | null>(null);
  const [detailsInitialTarget, setDetailsInitialTarget] = useState<'alarm' | 'note' | 'time' | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [alarmRingNotification, setAlarmRingNotification] = useState<Notification | null>(null);
  const [scheduleScrollFocus, setScheduleScrollFocus] = useState<{
    token: number;
    startMinutes: number | null;
  } | null>(null);
  const [inlineSlot, setInlineSlot] = useState<string | null>(null);
  const [titleEditReminderId, setTitleEditReminderId] = useState<string | null>(null);
  const [titleEditDraft, setTitleEditDraft] = useState('');
  const titleEditReminderIdRef = useRef<string | null>(null);
  const titleEditDraftRef = useRef('');
  const [, setScheduleRefreshKey] = useState(0);

  useEffect(() => {
    titleEditReminderIdRef.current = titleEditReminderId;
  }, [titleEditReminderId]);
  useEffect(() => {
    titleEditDraftRef.current = titleEditDraft;
  }, [titleEditDraft]);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvt, (e) => setKeyboardPad(e.endCoordinates.height));
    const h = Keyboard.addListener(hideEvt, () => setKeyboardPad(0));
    return () => {
      s.remove();
      h.remove();
    };
  }, []);

  /** Android: al volver a primer plano (Ajustes, otra app), reprogramar alarmas. */
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        void resyncAllScheduledNotifications();
      }, 600);
    });
    return () => {
      sub.remove();
      if (t) clearTimeout(t);
    };
  }, []);

  const selectedDayIndex = getDayIndexFromDate(selectedDate);
  const displayDate = formatDisplayDate(selectedDate);
  const weekSunday = useMemo(() => getSundayOfWeek(weekAnchor), [weekAnchor]);
  const weekHeaderLabel = useMemo(() => formatWeekMonthYearRange(weekSunday), [weekSunday]);
  const weekNumber = useMemo(() => getWeekNumber(weekSunday), [weekSunday]);
  const monthHeaderLabel = useMemo(() => formatDisplayDate(selectedDate), [selectedDate]);

  const loadReminders = useCallback(async () => {
    const list = await getRemindersByDate(selectedDate);
    setReminders(list);
  }, [selectedDate]);

  const loadWeekReminders = useCallback(async () => {
    const dates = getWeekDates(weekAnchor);
    const lists = await Promise.all(dates.map((d) => getRemindersByDate(d)));
    setWeekReminders(lists.flat());
  }, [weekAnchor]);

  useEffect(() => {
    loadReminders();
  }, [loadReminders]);

  /** Notifee + canales: solo al montar. Borrar/recargar canal en cada cambio de día cancelaba triggers en Android. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await runStartupPermissionFlow();
      if (cancelled) return;
      await initLocalNotifications();
      if (cancelled) return;
      const all = await getAllReminders();
      if (cancelled) return;
      await Promise.all(all.map((r) => syncReminderNotification(r, { preservePostponeSnoozes: true })));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSelectedReminder(null);
    setTitleEditReminderId(null);
    setTitleEditDraft('');
    titleEditReminderIdRef.current = null;
  }, [selectedDate]);

  useEffect(() => {
    loadWeekReminders();
  }, [loadWeekReminders]);

  const loadMonthReminders = useCallback(async () => {
    const year = monthAnchor.getFullYear();
    const month = monthAnchor.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const dates: string[] = [];
    const d = new Date(first);
    while (d <= last) {
      dates.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
      d.setDate(d.getDate() + 1);
    }
    const lists = await Promise.all(dates.map((date) => getRemindersByDate(date)));
    setMonthReminders(lists.flat());
  }, [monthAnchor]);

  useEffect(() => {
    loadMonthReminders();
  }, [loadMonthReminders]);

  const loadGoToDateMonthReminders = useCallback(async () => {
    if (goToDateMonthAnchor == null) return;
    const year = goToDateMonthAnchor.getFullYear();
    const month = goToDateMonthAnchor.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const dates: string[] = [];
    const d = new Date(first);
    while (d <= last) {
      dates.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
      d.setDate(d.getDate() + 1);
    }
    const lists = await Promise.all(dates.map((date) => getRemindersByDate(date)));
    setGoToDateReminders(lists.flat());
  }, [goToDateMonthAnchor]);

  useEffect(() => {
    if (goToDateVisible && goToDateMonthAnchor) loadGoToDateMonthReminders();
  }, [goToDateVisible, goToDateMonthAnchor, loadGoToDateMonthReminders]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      REMINDER_DELETED_FROM_NOTIFICATION,
      (payload: { reminderId: string }) => {
        void loadReminders();
        void loadWeekReminders();
        void loadMonthReminders();
        void loadGoToDateMonthReminders();
        setSelectedReminder((prev) => {
          if (prev?.id === payload.reminderId) {
            queueMicrotask(() => setDetailsVisible(false));
            setTitleEditReminderId(null);
            setTitleEditDraft('');
            titleEditReminderIdRef.current = null;
            return null;
          }
          return prev;
        });
      }
    );
    return () => sub.remove();
  }, [loadReminders, loadWeekReminders, loadMonthReminders, loadGoToDateMonthReminders]);

  /** "Reprogramar" desde el aviso: abrir el modal de detalles de ese recordatorio (selector de fecha/hora). */
  const openReminderForReschedule = useCallback(async (reminderId: string) => {
    const r = await getReminderById(reminderId);
    if (!r) return;
    setActiveTab('day');
    setSelectedDate(r.date);
    setSelectedReminder(r);
    setDetailsInitialTarget('time');
    setDetailsDefaultStartTime(undefined);
    setDetailsDefaultTitle('');
    setDetailsVisible(true);
  }, []);

  useEffect(() => {
    // Arranque en frío: el aviso pudo emitir "Reprogramar" antes de montar el listener.
    const pending = consumePendingRescheduleReminderId();
    if (pending) void openReminderForReschedule(pending);
    const sub = DeviceEventEmitter.addListener(
      REMINDER_RESCHEDULE_FROM_NOTIFICATION,
      (payload: { reminderId: string }) => {
        void openReminderForReschedule(payload.reminderId);
      }
    );
    return () => sub.remove();
  }, [openReminderForReschedule]);

  useEffect(() => {
    const showSub = DeviceEventEmitter.addListener(
      ALARM_RING_DISPLAY,
      (payload: AlarmRingDisplayPayload) => {
        setAlarmRingNotification(payload.notification);
      },
    );
    const hideSub = DeviceEventEmitter.addListener(
      ALARM_RING_DISMISSED,
      (payload: { notificationId: string }) => {
        setAlarmRingNotification((prev) =>
          prev?.id === payload.notificationId ? null : prev,
        );
      },
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleAlarmRingAction = useCallback(
    async (action: 'complete' | 'snooze' | 'reschedule') => {
      if (!alarmRingNotification) return;
      await processAlarmRingUserAction(action, alarmRingNotification);
      setAlarmRingNotification(null);
      void loadReminders();
      void loadWeekReminders();
      void loadMonthReminders();
    },
    [
      alarmRingNotification,
      loadReminders,
      loadWeekReminders,
      loadMonthReminders,
    ],
  );

  const handlePrevious = useCallback(() => {
    setSelectedDate((prev) => addDays(prev, -1));
  }, []);

  const handleNext = useCallback(() => {
    setSelectedDate((prev) => addDays(prev, 1));
  }, []);

  const daySwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-36, 36])
        .failOffsetY([-22, 22])
        .onEnd((e) => {
          const tx = e.translationX;
          const vx = e.velocityX;
          const distOk = Math.abs(tx) >= 44;
          const velOk = Math.abs(vx) >= 420;
          if (!distOk && !velOk) return;
          if (distOk) {
            if (tx < 0) runOnJS(handleNext)();
            else runOnJS(handlePrevious)();
          } else {
            if (vx < 0) runOnJS(handleNext)();
            else runOnJS(handlePrevious)();
          }
        }),
    [handleNext, handlePrevious]
  );

  const handleSelectDay = (dayIndex: number) => {
    setSelectedDate(getDateForDayIndexInWeek(selectedDate, dayIndex));
  };

  /**
   * Pulsar la fila de una hora siempre abre crear en esa franja.
   * Los eventos largos ocupan varias filas: no abrir detalles/edición del evento al tocar otra hora;
   * título del evento → edición inline; columna de hora de ese evento → modal de detalles.
   */
  const handleSlotPress = (payload: {
    hourLabel: string;
    hourIndex: number;
    fragmentIndex: number;
  }) => {
    // Tocar el cajón de una hora vacía → escribir directo (inline). La hora abre el modal.
    commitPendingTitleEdit();
    setSelectedReminder(null);
    setInlineSlot(`${payload.hourIndex}-${payload.fragmentIndex}`);
  };

  // Tocar el número de hora en una franja vacía → modal «Nuevo» con esa hora (fin +1h lo pone el modal).
  const handleEmptyHourLabelPress = (hourLabel: string, hourIndex: number) => {
    if (!commitPendingTitleEdit()) return;
    const startTime =
      scheduleHourMinutes != null && scheduleHourMinutes[hourIndex] != null
        ? `${String(Math.floor(scheduleHourMinutes[hourIndex] / 60)).padStart(2, '0')}:${String(scheduleHourMinutes[hourIndex] % 60).padStart(2, '0')}`
        : slotLabelTo24H(hourLabel);
    setInlineSlot(null);
    setTitleEditReminderId(null);
    setTitleEditDraft('');
    titleEditReminderIdRef.current = null;
    setSelectedReminder(null);
    setDetailsInitialTarget(null);
    setDetailsDefaultStartTime(startTime);
    setDetailsDefaultTitle('');
    setDetailsVisible(true);
  };

  const handleInlineSave = async (hourLabel: string, title: string, rowIndex: number) => {
    setInlineSlot(null);
    setSelectedReminder(null);
    setTitleEditReminderId(null);
    setTitleEditDraft('');
    titleEditReminderIdRef.current = null;
    const startTime =
      scheduleHourMinutes != null && scheduleHourMinutes[rowIndex] != null
        ? `${String(Math.floor(scheduleHourMinutes[rowIndex] / 60)).padStart(2, '0')}:${String(scheduleHourMinutes[rowIndex] % 60).padStart(2, '0')}`
        : slotLabelTo24H(hourLabel);
    const endTime = addHour(startTime);
    const created = await createReminder({
      date: selectedDate,
      startTime,
      endTime,
      title,
      alarm: true,
      alarmOffset: 5,
      alarmUnit: 'minutes',
    });
    await syncReminderNotification(created);
    await loadReminders();
    await loadWeekReminders();
  };

  const handleInlineCancel = () => {
    setInlineSlot(null);
    setSelectedReminder(null);
    setTitleEditReminderId(null);
    setTitleEditDraft('');
    titleEditReminderIdRef.current = null;
  };

  const handleUpdate = async (id: string, input: UpdateReminderInput) => {
    const updated = await updateReminder(id, input);
    if (updated) await syncReminderNotification(updated);
    await loadReminders();
    await loadWeekReminders();
  };

  const handleDelete = async (id: string) => {
    await cancelNotificationsForReminder(id);
    await deleteReminder(id);
    await loadReminders();
    await loadWeekReminders();
  };

  const commitPendingTitleEdit = useCallback((): boolean => {
    const id = titleEditReminderIdRef.current;
    if (!id) return true;
    const trimmed = titleEditDraftRef.current.trim();
    titleEditReminderIdRef.current = null;
    setTitleEditReminderId(null);
    setTitleEditDraft('');
    if (!trimmed) {
      void handleDelete(id);
      setSelectedReminder((prev) => (prev?.id === id ? null : prev));
      return false;
    }
    void handleUpdate(id, { title: trimmed });
    setSelectedReminder((prev) => (prev?.id === id ? { ...prev, title: trimmed } : prev));
    return true;
  }, [handleDelete, handleUpdate]);

  const handleDetalles = useCallback(() => {
    setDetailsInitialTarget(null);
    if (!commitPendingTitleEdit()) return;
    setDetailsVisible(true);
  }, [commitPendingTitleEdit]);

  const handleReminderHourPress = useCallback(
    (r: Reminder) => {
      if (!commitPendingTitleEdit()) return;
      setDetailsInitialTarget(null);
      setTitleEditReminderId(null);
      setTitleEditDraft('');
      titleEditReminderIdRef.current = null;
      setSelectedReminder(r);
      setDetailsDefaultStartTime(undefined);
      setDetailsDefaultTitle('');
      setDetailsVisible(true);
    },
    [commitPendingTitleEdit]
  );

  const handleEmptyHourPress = useCallback(
    (hourLabel: string, draftTitle?: string) => {
      if (!commitPendingTitleEdit()) return;
      setInlineSlot(null);
      setTitleEditReminderId(null);
      setTitleEditDraft('');
      titleEditReminderIdRef.current = null;
      setSelectedReminder(null);
      setDetailsInitialTarget(null);
      setDetailsDefaultStartTime(slotLabelTo24H(hourLabel));
      setDetailsDefaultTitle(draftTitle?.trim() ?? '');
      setDetailsVisible(true);
    },
    [commitPendingTitleEdit]
  );

  const handleReminderAlarmIconPress = useCallback(
    (r: Reminder) => {
      if (!commitPendingTitleEdit()) return;
      setTitleEditReminderId(null);
      setTitleEditDraft('');
      titleEditReminderIdRef.current = null;
      setSelectedReminder(r);
      setDetailsDefaultStartTime(undefined);
      setDetailsDefaultTitle('');
      setDetailsInitialTarget('alarm');
      setDetailsVisible(true);
    },
    [commitPendingTitleEdit]
  );

  const handleReminderNoteIconPress = useCallback(
    (r: Reminder) => {
      if (!commitPendingTitleEdit()) return;
      setTitleEditReminderId(null);
      setTitleEditDraft('');
      titleEditReminderIdRef.current = null;
      setSelectedReminder(r);
      setDetailsDefaultStartTime(undefined);
      setDetailsDefaultTitle('');
      setDetailsInitialTarget('note');
      setDetailsVisible(true);
    },
    [commitPendingTitleEdit]
  );

  const handleDetailsDelete = useCallback(
    async (id: string) => {
      await handleDelete(id);
      setDetailsVisible(false);
      setDetailsInitialTarget(null);
      setSelectedReminder(null);
      setDetailsDefaultStartTime(undefined);
      setDetailsDefaultTitle('');
      setTitleEditReminderId(null);
      setTitleEditDraft('');
      titleEditReminderIdRef.current = null;
    },
    [handleDelete]
  );

  const handleDetailsCommit = async (
    id: string | null,
    input: Omit<CreateReminderInput, 'date' | 'startTime' | 'endTime'> & {
      title: string;
      date?: string;
      startTime?: string;
      endTime?: string;
    }
  ) => {
    let createdForInlineTitle: Reminder | null = null;
    if (id == null) {
      const payload: CreateReminderInput = {
        title: input.title,
        date: input.date ?? selectedDate,
        startTime: input.startTime ?? '09:00',
        endTime: input.endTime ?? addHour(input.startTime ?? '09:00'),
        description: input.description,
        color: input.color,
        alarm: input.alarm,
        alarmOffset: input.alarmOffset,
        alarmUnit: input.alarmUnit,
        repeat: input.repeat,
        repeatInterval: input.repeatInterval,
        repeatEndDate: input.repeatEndDate,
        repeatWeekdays: input.repeatWeekdays,
        note: input.note,
        allDay: input.allDay,
        noTime: input.noTime,
        location: input.location,
        category: input.category,
      };
      const created = await createReminder(payload);
      createdForInlineTitle = created;
      await syncReminderNotification(created);
      setActiveTab('day');
      const scrollMin = payload.noTime ? null : startTimeToScrollMinutes(payload.startTime ?? '09:00');
      setScheduleScrollFocus((prev) => ({
        token: (prev?.token ?? 0) + 1,
        startMinutes: scrollMin,
      }));
    } else {
      await clearAcksForReminder(id);
      const updated = await updateReminder(id, input);
      if (updated) await syncReminderNotification(updated);
    }
    await loadReminders();
    await loadWeekReminders();
    if (createdForInlineTitle) {
      const c = createdForInlineTitle;
      InteractionManager.runAfterInteractions(() => {
        const delay = Platform.OS === 'android' ? 200 : 120;
        setTimeout(() => {
          setTitleEditReminderId(c.id);
          setTitleEditDraft(c.title ?? '');
          titleEditReminderIdRef.current = c.id;
          titleEditDraftRef.current = c.title ?? '';
          setSelectedReminder(null);
          setInlineSlot(null);
        }, delay);
      });
    }
  };

  const handleHoy = () => {
    setSelectedDate(getTodayISO());
    setWeekAnchor(new Date());
    setMonthAnchor(new Date());
  };

  const handleWeekCellPress = (dateISO: string, hourLabel: string) => {
    setActiveTab('day');
    setSelectedDate(dateISO);
    setSelectedReminder(null);
    setDetailsInitialTarget(null);
    setDetailsDefaultStartTime(slotLabelTo24H(hourLabel));
    setDetailsDefaultTitle('');
    setDetailsVisible(true);
  };

  const handleWeekReminderPress = (reminder: Reminder) => {
    setActiveTab('day');
    setSelectedDate(reminder.date);
    setSelectedReminder(reminder);
    setDetailsInitialTarget(null);
    setDetailsDefaultStartTime(undefined);
    setDetailsDefaultTitle('');
    setDetailsVisible(true);
  };

  const handlePreviousWeek = () => {
    const d = new Date(weekAnchor);
    d.setDate(d.getDate() - 7);
    setWeekAnchor(d);
  };

  const handleNextWeek = () => {
    const d = new Date(weekAnchor);
    d.setDate(d.getDate() + 7);
    setWeekAnchor(d);
  };

  const handleMonthDayPress = (dateISO: string) => {
    setSelectedDate(dateISO);
    setActiveTab('day');
  };

  const handleEventsReminderPress = (reminder: Reminder) => {
    setSelectedDate(reminder.date);
    setActiveTab('day');
    setSelectedReminder(reminder);
    setDetailsInitialTarget(null);
    setDetailsDefaultStartTime(undefined);
    setDetailsDefaultTitle('');
    setDetailsVisible(true);
  };

  const handlePreviousMonth = () => {
    const d = new Date(monthAnchor);
    d.setMonth(d.getMonth() - 1);
    setMonthAnchor(d);
  };

  const handleNextMonth = () => {
    const d = new Date(monthAnchor);
    d.setMonth(d.getMonth() + 1);
    setMonthAnchor(d);
  };

  const handleIrA = () => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(1);
    setGoToDateMonthAnchor(d);
    setGoToDateVisible(true);
  };

  const handleGoToDateSelect = (dateISO: string) => {
    setSelectedDate(dateISO);
    setActiveTab('day');
    setGoToDateVisible(false);
  };

  const handleGoToDateMonthChange = (year: number, month: number) => {
    setGoToDateMonthAnchor(new Date(year, month, 1));
  };

  const daySchedule = getDaySchedule(selectedDate);
  const noTimeReminders = reminders.filter((r) => r.noTime);
  const timedReminders = reminders.filter((r) => !r.noTime);
  const getDayVisibleRange = useCallback(
    (dateISO: string) => {
      const d = getDaySchedule(dateISO);
      return {
        startHour: d?.startHour ?? preferences.scheduleStartHour,
        endHour: d?.endHour ?? preferences.scheduleEndHour,
      };
    },
    [preferences.scheduleStartHour, preferences.scheduleEndHour]
  );
  const { labels: scheduleHours, minuteValues: scheduleHourMinutes } = buildHoursLabelsWithOptional30(
    daySchedule?.startHour ?? preferences.scheduleStartHour,
    daySchedule?.endHour ?? preferences.scheduleEndHour,
    timedReminders
  );

  if (optionsVisible) {
    return (
      <OptionsScreen
        onClose={() => setOptionsVisible(false)}
        selectedDate={selectedDate}
        onDayScheduleSaved={() => setScheduleRefreshKey((k) => k + 1)}
      />
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.screenBackground }]}>
      <StatusBar style={preferences.darkMode ? 'light' : 'dark'} />
      {(activeTab === 'day' || activeTab === 'events') && (
        <AgendaHeader
          displayDate={displayDate}
          selectedDayIndex={selectedDayIndex}
          onSelectDay={handleSelectDay}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onDatePress={() => setOptionsVisible(true)}
        />
      )}
      {activeTab === 'day' && (
        <GestureDetector gesture={daySwipeGesture}>
          <View style={styles.daySwipeArea}>
            <AgendaSchedule
              hours={scheduleHours}
              hourMinutes={scheduleHourMinutes}
              reminders={timedReminders}
              pinNoTime={noTimeReminders}
              onSlotPress={handleSlotPress}
              onReminderPress={(r) => {
                titleEditReminderIdRef.current = r.id;
                setTitleEditReminderId(r.id);
                setTitleEditDraft(r.title ?? '');
                setSelectedReminder(r);
                setInlineSlot(null);
              }}
              onReminderHourPress={handleReminderHourPress}
              onEmptyHourPress={handleEmptyHourPress}
              onEmptyHourLabelPress={handleEmptyHourLabelPress}
              onReminderAlarmIconPress={handleReminderAlarmIconPress}
              onReminderNoteIconPress={handleReminderNoteIconPress}
              selectedReminderId={selectedReminder?.id ?? null}
              inlineSlot={inlineSlot}
              onInlineSave={handleInlineSave}
              onInlineCancel={handleInlineCancel}
              titleEditReminderId={titleEditReminderId}
              titleEditDraft={titleEditDraft}
              onTitleEditChange={setTitleEditDraft}
              onCommitTitleEdit={commitPendingTitleEdit}
              scrollFocusRequest={scheduleScrollFocus}
            />
          </View>
        </GestureDetector>
      )}
      {activeTab === 'week' && (
        <AgendaNavBar chipLabel={weekHeaderLabel}>
          <View style={navStyles.rightWrap}>
            <TouchableOpacity style={navStyles.arrowCell} onPress={handlePreviousWeek} hitSlop={12}>
              <Text style={navStyles.arrowText}>{'◀'}</Text>
            </TouchableOpacity>
            <View style={navStyles.selector}>
              <View style={navStyles.selectorLabel}>
                <Text style={navStyles.selectorLabelText} numberOfLines={1}>
                  Semana {weekNumber}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={navStyles.arrowCell} onPress={handleNextWeek} hitSlop={12}>
              <Text style={navStyles.arrowText}>{'▶'}</Text>
            </TouchableOpacity>
          </View>
        </AgendaNavBar>
      )}
      {activeTab === 'week' && (
        <View style={styles.daySwipeArea}>
          <WeekView
            weekAnchor={weekAnchor}
            reminders={weekReminders}
            onCellPress={handleWeekCellPress}
            onReminderPress={handleWeekReminderPress}
          />
        </View>
      )}
      {activeTab === 'month' && (
        <AgendaNavBar chipLabel={monthHeaderLabel}>
          <View style={navStyles.rightWrap}>
            <TouchableOpacity style={navStyles.arrowCell} onPress={handlePreviousMonth} hitSlop={12}>
              <Text style={navStyles.arrowText}>{'◀'}</Text>
            </TouchableOpacity>
            <View style={{ width: 8 }} />
            <TouchableOpacity style={navStyles.arrowCell} onPress={handleNextMonth} hitSlop={12}>
              <Text style={navStyles.arrowText}>{'▶'}</Text>
            </TouchableOpacity>
          </View>
        </AgendaNavBar>
      )}
      {activeTab === 'month' && (
        <View style={styles.daySwipeArea}>
          <MonthView
            monthAnchor={monthAnchor}
            reminders={monthReminders}
            onDayPress={handleMonthDayPress}
          />
        </View>
      )}
      {activeTab === 'events' && (
        <View style={styles.daySwipeArea}>
          <DaySummaryView reminders={reminders} onReminderPress={handleEventsReminderPress} />
        </View>
      )}
      <View style={{ marginBottom: keyboardPad }}>
      <AgendaFooter
        activeTab={activeTab}
        onTabChange={setActiveTab}
          onHoy={handleHoy}
          onNueva={() => {
            commitPendingTitleEdit();
            setSelectedReminder(null);
            setDetailsInitialTarget(null);
            setDetailsDefaultStartTime(undefined);
            setDetailsDefaultTitle('');
            setDetailsVisible(true);
          }}
          onDetalles={activeTab === 'day' ? handleDetalles : undefined}
          detallesEnabled={selectedReminder != null}
          onIrA={handleIrA}
        />
        {/* safe-area debajo del footer cuando NO hay teclado */}
        {keyboardPad === 0 ? <View style={{ height: insets.bottom }} /> : null}
      </View>
      {detailsVisible ? (
        <ScreenOverlay zIndex={60}>
          <EventDetailsModal
            visible
            reminder={selectedReminder}
            defaultDate={selectedDate}
            defaultStartTime={detailsDefaultStartTime}
            defaultTitle={detailsDefaultTitle}
            getDayVisibleRange={getDayVisibleRange}
            initialTarget={detailsInitialTarget}
            onSave={(id, input) => handleDetailsCommit(id, input)}
            onDelete={handleDetailsDelete}
            onClose={() => {
              setDetailsVisible(false);
              setDetailsInitialTarget(null);
              setSelectedReminder(null);
              setDetailsDefaultStartTime(undefined);
              setDetailsDefaultTitle('');
              setTitleEditReminderId(null);
              setTitleEditDraft('');
              titleEditReminderIdRef.current = null;
            }}
          />
        </ScreenOverlay>
      ) : null}
      {goToDateVisible ? (
        <ScreenOverlay zIndex={55}>
          <GoToDateScreen
            initialDate={selectedDate}
            reminders={goToDateReminders}
            onMonthChange={handleGoToDateMonthChange}
            onSelectDate={handleGoToDateSelect}
            onClose={() => setGoToDateVisible(false)}
          />
        </ScreenOverlay>
      ) : null}
      {alarmRingNotification ? (
        <ScreenOverlay zIndex={100}>
          <AlarmRingScreen
            notification={alarmRingNotification}
            onComplete={() => void handleAlarmRingAction('complete')}
            onSnooze={() => void handleAlarmRingAction('snooze')}
            onReschedule={() => void handleAlarmRingAction('reschedule')}
          />
        </ScreenOverlay>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  daySwipeArea: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
  },
});
