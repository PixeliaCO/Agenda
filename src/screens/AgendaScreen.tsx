/**
 * Pantalla principal de la agenda diaria.
 * Compone el header (fecha y selector de día), el área de franjas horarias con recordatorios y el footer.
 * Gestiona el CRUD de recordatorios (crear, editar, eliminar) y la fecha seleccionada.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { DeviceEventEmitter, View, StyleSheet, Alert, Keyboard, Platform } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AgendaHeader, AgendaSchedule, AgendaFooter, WeekView, MonthView, DaySummaryView, GoToDateModal, OptionsModal, EventDetailsModal } from '../components';
import { usePreferences } from '../contexts/PreferencesContext';
import type { AgendaViewTab } from '../types/agenda';
import type { Reminder, CreateReminderInput, UpdateReminderInput } from '../types/reminder';
import { buildHoursLabelsWithOptional30 } from '../utils/scheduleHours';
import {
  formatDateFull,
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
} from '../services/localNotificationService';
import { runStartupPermissionFlow } from '../services/startupPermissionsService';
import { getDaySchedule } from '../services/dayScheduleService';

export function AgendaScreen() {
  const insets = useSafeAreaInsets();
  const { preferences, colors } = usePreferences();
  const [keyboardPad, setKeyboardPad] = useState(0);
  const [selectedDate, setSelectedDate] = useState(getTodayISO());
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<AgendaViewTab>('day');
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [detailsDefaultStartTime, setDetailsDefaultStartTime] = useState<string | undefined>(undefined);
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [weekReminders, setWeekReminders] = useState<Reminder[]>([]);
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const [monthReminders, setMonthReminders] = useState<Reminder[]>([]);
  const [goToDateVisible, setGoToDateVisible] = useState(false);
  const [goToDateMonthAnchor, setGoToDateMonthAnchor] = useState<Date | null>(null);
  const [goToDateReminders, setGoToDateReminders] = useState<Reminder[]>([]);
  const [selectedReminder, setSelectedReminder] = useState<Reminder | null>(null);
  const [detailsInitialTarget, setDetailsInitialTarget] = useState<'alarm' | 'note' | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
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

  const selectedDayIndex = getDayIndexFromDate(selectedDate);
  const displayDate = formatDateFull(selectedDate);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await runStartupPermissionFlow();
      if (cancelled) return;
      await initLocalNotifications();
      // Resync: asegura que lo programado coincide con lo guardado en local.
      const all = await getAllReminders();
      await Promise.all(all.map((r) => syncReminderNotification(r)));
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
    commitPendingTitleEdit();
    setSelectedReminder(null);
    setInlineSlot(`${payload.hourIndex}-${payload.fragmentIndex}`);
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
      setDetailsInitialTarget('note');
      setDetailsVisible(true);
    },
    [commitPendingTitleEdit]
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
        note: input.note,
        allDay: input.allDay,
        noTime: input.noTime,
      };
      const created = await createReminder(payload);
      await syncReminderNotification(created);
    } else {
      const updated = await updateReminder(id, input);
      if (updated) await syncReminderNotification(updated);
    }
    await loadReminders();
    await loadWeekReminders();
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
    setDetailsVisible(true);
  };

  const handleWeekReminderPress = (reminder: Reminder) => {
    setActiveTab('day');
    setSelectedDate(reminder.date);
    setSelectedReminder(reminder);
    setDetailsInitialTarget(null);
    setDetailsDefaultStartTime(undefined);
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

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.screenBackground }]}>
      <StatusBar style={preferences.darkMode ? 'light' : 'dark'} />
      {activeTab === 'day' && (
        <GestureDetector gesture={daySwipeGesture}>
          <View style={styles.daySwipeArea}>
      <AgendaHeader
        displayDate={displayDate}
        selectedDayIndex={selectedDayIndex}
              onSelectDay={handleSelectDay}
        onPrevious={handlePrevious}
        onNext={handleNext}
              onDatePress={() => setOptionsVisible(true)}
            />
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
            />
          </View>
        </GestureDetector>
      )}
      {activeTab === 'week' && (
        <WeekView
          weekAnchor={weekAnchor}
          reminders={weekReminders}
          onPreviousWeek={handlePreviousWeek}
          onNextWeek={handleNextWeek}
          onCellPress={handleWeekCellPress}
          onReminderPress={handleWeekReminderPress}
        />
      )}
      {activeTab === 'month' && (
        <MonthView
          monthAnchor={monthAnchor}
          reminders={monthReminders}
          onPreviousMonth={handlePreviousMonth}
          onNextMonth={handleNextMonth}
          onDayPress={handleMonthDayPress}
        />
      )}
      {activeTab === 'events' && (
        <DaySummaryView
          dateISO={selectedDate}
          reminders={reminders}
          onPreviousDay={handlePrevious}
          onNextDay={handleNext}
          onReminderPress={handleEventsReminderPress}
        />
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
            setDetailsVisible(true);
          }}
          onDetalles={activeTab === 'day' ? handleDetalles : undefined}
          detallesEnabled={selectedReminder != null}
          onIrA={handleIrA}
        />
        {/* safe-area debajo del footer cuando NO hay teclado */}
        {keyboardPad === 0 ? <View style={{ height: insets.bottom }} /> : null}
      </View>
      <EventDetailsModal
        visible={detailsVisible}
        reminder={selectedReminder}
        defaultDate={selectedDate}
        defaultStartTime={detailsDefaultStartTime}
        getDayVisibleRange={getDayVisibleRange}
        initialTarget={detailsInitialTarget}
        onSave={(id, input) => handleDetailsCommit(id, input)}
        onClose={() => {
          setDetailsVisible(false);
          setDetailsInitialTarget(null);
          setSelectedReminder(null);
          setDetailsDefaultStartTime(undefined);
          setTitleEditReminderId(null);
          setTitleEditDraft('');
          titleEditReminderIdRef.current = null;
        }}
      />
      <GoToDateModal
        visible={goToDateVisible}
        initialDate={selectedDate}
        reminders={goToDateReminders}
        onMonthChange={handleGoToDateMonthChange}
        onSelectDate={handleGoToDateSelect}
        onClose={() => setGoToDateVisible(false)}
      />
      <OptionsModal
        visible={optionsVisible}
        onClose={() => setOptionsVisible(false)}
        selectedDate={selectedDate}
        onDayScheduleSaved={() => setScheduleRefreshKey((k) => k + 1)}
      />
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
