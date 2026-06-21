/**
 * Pantalla «Detalles del evento»: horario, fecha, alarma, repetición.
 */

import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Pressable,
  TextInput,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import { Checkbox } from 'expo-checkbox';

const notaPng = require('../../../assets/nota.png');
/** Subrayado de puntos (el borde `dotted` de RN se rompe en Android). */
const UNDERLINE_DOTS = Array.from({ length: 60 });
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Reminder, AlarmUnit } from '../../types/reminder';
import { usePreferences } from '../../contexts/PreferencesContext';
import {
  time24To12,
  time12To24,
  formatTime12h,
  formatTime12hCompact,
  formatDatePalm,
  getDayIndexFromDate,
} from '../../utils/date';
import { dayVisibleRangeToTimes } from '../../utils/scheduleHours';
import { addHour } from '../../services/reminderService';
import { scaledFontSize, titleFont } from '../../utils/typography';
import { ChangeRepeatScreen, buildRepeatSummary, REPEAT_QUICK_OPTIONS, matchRepeatQuickOption, type RepeatQuickOptionId } from '../ChangeRepeatModal';
import { GoToDateScreen } from '../GoToDateModal/GoToDateModal';
import { EditCategoriesScreen } from '../EditCategoriesModal';
import { PalmScreenShell, ScreenOverlay } from '../PalmScreenShell';
import {
  categoryColor,
  categoryDisplayLabel,
  EDIT_CATEGORIES_LABEL,
  UNCategorized_COLOR,
  UNCategorized_LABEL,
  type CategoryItem,
} from '../../constants/categories';
import { getAllCategories } from '../../services/categoryService';

export type EventDetailsModalProps = {
  visible: boolean;
  /** null = crear evento nuevo */
  reminder: Reminder | null;
  /** Fecha inicial al crear (y referencia de día) */
  defaultDate: string;
  /** Al crear desde la vista semana: hora sugerida (HH:mm 24h) */
  defaultStartTime?: string;
  /** Texto ya escrito en la fila inline antes de abrir el selector de hora */
  defaultTitle?: string;
  /** Rango de la cuadrícula para la fecha (todo el día = de inicio a fin de este rango) */
  getDayVisibleRange: (dateISO: string) => { startHour: number; endHour: number };
  /** id null → crear; con id → actualizar. Puede devolver Promise para cerrar el modal tras persistir. */
  onSave: (
    id: string | null,
    input: {
      title: string;
      startTime?: string;
      endTime?: string;
      date?: string;
      alarm?: boolean;
      alarmOffset?: number;
      alarmUnit?: AlarmUnit;
      repeat?: Reminder['repeat'];
      repeatInterval?: number;
      repeatEndDate?: string;
      repeatWeekdays?: number[];
      note?: string;
      allDay?: boolean;
      noTime?: boolean;
      location?: string;
      category?: string;
    }
  ) => void | Promise<void>;
  /** Eliminar evento (solo edición). */
  onDelete?: (id: string) => void | Promise<void>;
  onClose: () => void;
  /** Al abrir: ir a alarma/nota o abrir directamente el selector de hora */
  initialTarget?: 'alarm' | 'note' | 'time' | null;
};

/** Aire extra entre el formulario y el teclado en el modal. */
const MODAL_KEYBOARD_EXTRA = 32;

/** Minutos en pasos de 5 (selector estilo Palm). */
const PALM_MINUTE_STEPS = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'] as const;

/** Filas visibles en cada columna hora/minuto del selector Palm. */
const PALM_PICKER_ROW_COUNT = 12;

const OUTLINE_DOT = 2;
const OUTLINE_GAP = 3;
const OUTLINE_RADIUS = 10;
const OUTLINE_H_DOTS = 56;
const OUTLINE_V_DOTS = 56;

/** Borde redondeado de puntos (el `borderStyle: 'dotted'` de RN falla en Android). */
function DottedRoundedOutline({
  children,
  color,
  radius = OUTLINE_RADIUS,
  style,
}: {
  children: React.ReactNode;
  color: string;
  radius?: number;
  style?: object;
}) {
  const dotStyle = { width: OUTLINE_DOT, height: OUTLINE_DOT, backgroundColor: color };
  const hDots = (prefix: string) =>
    Array.from({ length: OUTLINE_H_DOTS }, (_, i) => (
      <View key={`${prefix}${i}`} style={[dotStyle, i < OUTLINE_H_DOTS - 1 && { marginRight: OUTLINE_GAP }]} />
    ));
  const vDots = (prefix: string) =>
    Array.from({ length: OUTLINE_V_DOTS }, (_, i) => (
      <View key={`${prefix}${i}`} style={[dotStyle, i < OUTLINE_V_DOTS - 1 && { marginBottom: OUTLINE_GAP }]} />
    ));
  const cornerDots = [
    { top: 1, left: 1 },
    { top: 1, right: 1 },
    { bottom: 1, left: 1 },
    { bottom: 1, right: 1 },
    { top: 4, left: 0 },
    { top: 0, left: 4 },
    { top: 4, right: 0 },
    { top: 0, right: 4 },
    { bottom: 4, left: 0 },
    { bottom: 0, left: 4 },
    { bottom: 4, right: 0 },
    { bottom: 0, right: 4 },
  ];

  return (
    <View
      style={[
        {
          position: 'relative',
          borderRadius: radius,
          paddingHorizontal: 10,
          paddingVertical: 6,
          minHeight: 32,
          backgroundColor: '#ffffff',
        },
        style,
      ]}
    >
      <View
        style={{ position: 'absolute', top: 0, left: radius, right: radius, overflow: 'hidden', height: OUTLINE_DOT }}
        pointerEvents="none"
      >
        <View style={{ flexDirection: 'row' }}>{hDots('t')}</View>
      </View>
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: radius,
          right: radius,
          overflow: 'hidden',
          height: OUTLINE_DOT,
        }}
        pointerEvents="none"
      >
        <View style={{ flexDirection: 'row' }}>{hDots('b')}</View>
      </View>
      <View
        style={{
          position: 'absolute',
          top: radius,
          bottom: radius,
          left: 0,
          width: OUTLINE_DOT,
          overflow: 'hidden',
        }}
        pointerEvents="none"
      >
        <View style={{ flexDirection: 'column' }}>{vDots('l')}</View>
      </View>
      <View
        style={{
          position: 'absolute',
          top: radius,
          bottom: radius,
          right: 0,
          width: OUTLINE_DOT,
          overflow: 'hidden',
        }}
        pointerEvents="none"
      >
        <View style={{ flexDirection: 'column' }}>{vDots('r')}</View>
      </View>
      {cornerDots.map((pos, i) => (
        <View key={`c${i}`} style={[{ position: 'absolute' }, pos, dotStyle]} pointerEvents="none" />
      ))}
      {children}
    </View>
  );
}

type PalmHourRow = { label: string; hour: number; pm: boolean };

const PALM_HOUR_ROWS_PM: PalmHourRow[] = [
  { label: '12P', hour: 12, pm: true },
  ...([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const).map((n) => ({ label: String(n), hour: n, pm: true as boolean })),
];

const PALM_HOUR_ROWS_AM: PalmHourRow[] = [
  { label: '12AM', hour: 12, pm: false },
  ...([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const).map((n) => ({ label: String(n), hour: n, pm: false as boolean })),
];

const ALARM_UNIT_OPTIONS: { value: AlarmUnit; label: string }[] = [
  { value: 'minutes', label: 'Minutos' },
  { value: 'hours', label: 'Horas' },
  { value: 'days', label: 'Días' },
];

function CategoryDot({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(0,0,0,0.15)',
      }}
    />
  );
}

type DetailsPalmSnapshot = {
  startHour: string;
  startMin: string;
  startPm: boolean;
  endHour: string;
  endMin: string;
  endPm: boolean;
  allDay: boolean;
  noTime: boolean;
};

export function EventDetailsModal({
  visible,
  reminder,
  defaultDate,
  defaultStartTime,
  defaultTitle = '',
  getDayVisibleRange,
  onSave,
  onClose,
  onDelete,
  initialTarget = null,
}: EventDetailsModalProps) {
  const insets = useSafeAreaInsets();
  const detailsScrollRef = useRef<ScrollView>(null);
  const detailsCardRef = useRef<View>(null);
  const categoryAnchorRef = useRef<View>(null);
  const repeatAnchorRef = useRef<View>(null);
  const repeatSnapshotRef = useRef<{
    repeat: Reminder['repeat'];
    repeatInterval: number;
    repeatEndDate?: string;
    repeatWeekdays?: number[];
  } | null>(null);
  const alarmSectionY = useRef(0);
  const detailsPalmSnapshotRef = useRef<DetailsPalmSnapshot | null>(null);
  const [keyboardPad, setKeyboardPad] = useState(0);
  const [startHour, setStartHour] = useState('');
  const [startMin, setStartMin] = useState('');
  const [startPm, setStartPm] = useState(false);
  const [endHour, setEndHour] = useState('');
  const [endMin, setEndMin] = useState('');
  const [endPm, setEndPm] = useState(false);
  const [dateISO, setDateISO] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [noTime, setNoTime] = useState(false);
  const [alarm, setAlarm] = useState(true);
  const [alarmOffsetStr, setAlarmOffsetStr] = useState('0');
  const [alarmUnit, setAlarmUnit] = useState<AlarmUnit>('minutes');
  const [alarmUnitPickerVisible, setAlarmUnitPickerVisible] = useState(false);
  const [repeat, setRepeat] = useState<Reminder['repeat']>('none');
  const [repeatInterval, setRepeatInterval] = useState(1);
  const [repeatEndDate, setRepeatEndDate] = useState<string | undefined>(undefined);
  const [repeatWeekdays, setRepeatWeekdays] = useState<number[] | undefined>(undefined);
  const [repeatModalVisible, setRepeatModalVisible] = useState(false);
  const [repeatPickerVisible, setRepeatPickerVisible] = useState(false);
  const [repeatMenuPos, setRepeatMenuPos] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [repeatEndDateQuickPickerVisible, setRepeatEndDateQuickPickerVisible] = useState(false);
  const [note, setNote] = useState('');
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('');
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [categoryMenuPos, setCategoryMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [editCategoriesVisible, setEditCategoriesVisible] = useState(false);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  /** Nuevo evento + selector Palm: qué hora edita la columna derecha. */
  const [palmTimeFocus, setPalmTimeFocus] = useState<'start' | 'end'>('start');
  /** Columna de horas: lista AM o PM (flecha alterna). */
  const [palmPickerPm, setPalmPickerPm] = useState(false);
  /** Editar evento: hora colapsada; al tocar se muestran los selectores. */
  const [detailsPalmPickerVisible, setDetailsPalmPickerVisible] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);

  const { colors, fontScale } = usePreferences();
  const fs = (n: number) => scaledFontSize(n, fontScale);
  const { height: windowHeight } = useWindowDimensions();

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

  useEffect(() => {
    if (!visible) {
      setNoteModalVisible(false);
      setAlarmUnitPickerVisible(false);
      setCategoryPickerVisible(false);
      setCategoryMenuPos(null);
      setEditCategoriesVisible(false);
      setRepeatModalVisible(false);
      setRepeatPickerVisible(false);
      setRepeatMenuPos(null);
      setRepeatEndDateQuickPickerVisible(false);
      setDatePickerVisible(false);
      setDetailsPalmPickerVisible(false);
    }
  }, [visible]);

  const refreshCategories = () => {
    void getAllCategories().then(setCategories);
  };

  const openCategoryPicker = () => {
    setAlarmUnitPickerVisible(false);
    if (categoryPickerVisible) {
      closeCategoryPicker();
      return;
    }
    closeRepeatPicker();
    const card = detailsCardRef.current;
    const anchor = categoryAnchorRef.current;
    if (!card || !anchor) {
      setCategoryMenuPos(null);
      setCategoryPickerVisible(true);
      return;
    }
    anchor.measureLayout(
      card,
      (left, top, width, height) => {
        setCategoryMenuPos({ top: top + height, left, width });
        setCategoryPickerVisible(true);
      },
      () => {
        setCategoryMenuPos(null);
        setCategoryPickerVisible(true);
      }
    );
  };

  const closeCategoryPicker = () => {
    setCategoryPickerVisible(false);
    setCategoryMenuPos(null);
  };

  const closeRepeatPicker = () => {
    setRepeatPickerVisible(false);
    setRepeatMenuPos(null);
  };

  const openRepeatPicker = () => {
    setAlarmUnitPickerVisible(false);
    closeCategoryPicker();
    if (repeatPickerVisible) {
      closeRepeatPicker();
      return;
    }
    const anchor = repeatAnchorRef.current;
    if (!anchor) {
      setRepeatMenuPos(null);
      setRepeatPickerVisible(true);
      return;
    }
    anchor.measureInWindow((x, y, width, height) => {
      const menuTop = y + height + 2;
      const maxHeight = Math.max(120, Math.min(320, windowHeight - menuTop - insets.bottom - 16));
      setRepeatMenuPos({ top: menuTop, left: x, width, maxHeight });
      setRepeatPickerVisible(true);
    });
  };

  const applyRepeatQuickOption = (optionId: RepeatQuickOptionId) => {
    closeRepeatPicker();
    if (optionId === 'other') {
      setRepeatModalVisible(true);
      return;
    }
    const eventWeekday = getDayIndexFromDate(dateISO || defaultDate);
    if (optionId === 'none') {
      setRepeat('none');
      setRepeatInterval(1);
      setRepeatEndDate(undefined);
      setRepeatWeekdays(undefined);
      return;
    }
    if (optionId === 'daily_until') {
      repeatSnapshotRef.current = {
        repeat,
        repeatInterval,
        repeatEndDate,
        repeatWeekdays,
      };
      setRepeat('daily');
      setRepeatInterval(1);
      setRepeatWeekdays(undefined);
      setRepeatEndDateQuickPickerVisible(true);
      return;
    }
    if (optionId === 'weekly') {
      setRepeat('weekly');
      setRepeatInterval(1);
      setRepeatEndDate(undefined);
      setRepeatWeekdays([eventWeekday]);
      return;
    }
    if (optionId === 'biweekly') {
      setRepeat('weekly');
      setRepeatInterval(2);
      setRepeatEndDate(undefined);
      setRepeatWeekdays([eventWeekday]);
      return;
    }
    if (optionId === 'monthly') {
      setRepeat('monthly');
      setRepeatInterval(1);
      setRepeatEndDate(undefined);
      setRepeatWeekdays(undefined);
      return;
    }
    if (optionId === 'yearly') {
      setRepeat('yearly');
      setRepeatInterval(1);
      setRepeatEndDate(undefined);
      setRepeatWeekdays(undefined);
    }
  };

  const dismissRepeatEndDateQuickPicker = () => {
    const snap = repeatSnapshotRef.current;
    if (snap) {
      setRepeat(snap.repeat ?? 'none');
      setRepeatInterval(snap.repeatInterval);
      setRepeatEndDate(snap.repeatEndDate);
      setRepeatWeekdays(snap.repeatWeekdays);
    }
    repeatSnapshotRef.current = null;
    setRepeatEndDateQuickPickerVisible(false);
  };

  const confirmRepeatEndDateQuickPicker = (endISO: string) => {
    setRepeat('daily');
    setRepeatInterval(1);
    setRepeatEndDate(endISO);
    setRepeatWeekdays(undefined);
    repeatSnapshotRef.current = null;
    setRepeatEndDateQuickPickerVisible(false);
  };

  useEffect(() => {
    if (visible) refreshCategories();
  }, [visible]);

  useLayoutEffect(() => {
    if (!visible) return;
    if (reminder) {
      const s = time24To12(reminder.noTime ? '00:00' : reminder.startTime);
      setStartHour(String(s.hour));
      setStartMin(String(s.min).padStart(2, '0'));
      setStartPm(s.pm);
      const e = time24To12(
        reminder.noTime ? '00:00' : reminder.endTime ?? addHour(reminder.startTime)
      );
      setEndHour(String(e.hour));
      setEndMin(String(e.min).padStart(2, '0'));
      setEndPm(e.pm);
      setDateISO(reminder.date);
      setAllDay(Boolean(reminder.allDay));
      setNoTime(Boolean(reminder.noTime));
      setAlarm(reminder.noTime ? false : (reminder.alarm ?? true));
      setAlarmOffsetStr(
        reminder.alarmOffset != null && reminder.alarmOffset >= 0
          ? String(reminder.alarmOffset)
          : '0'
      );
      setAlarmUnit(reminder.alarmUnit ?? 'minutes');
      setAlarmUnitPickerVisible(false);
      closeCategoryPicker();
      setRepeat(reminder.repeat ?? 'none');
      setRepeatInterval(
        reminder.repeatInterval != null && reminder.repeatInterval >= 1 ? reminder.repeatInterval : 1
      );
      setRepeatEndDate(reminder.repeatEndDate);
      setRepeatWeekdays(
        reminder.repeatWeekdays?.length
          ? [...reminder.repeatWeekdays]
          : reminder.repeat === 'weekly'
            ? [getDayIndexFromDate(reminder.date)]
            : undefined
      );
      setRepeatModalVisible(false);
      setRepeatPickerVisible(false);
      setRepeatMenuPos(null);
      setRepeatEndDateQuickPickerVisible(false);
      setNote(reminder.note ?? '');
      setLocation(reminder.location ?? '');
      setCategory(reminder.category ?? '');
      setNoteModalVisible(false);
      if (initialTarget === 'note') {
        queueMicrotask(() => {
          setNoteDraft(reminder.note ?? '');
          setNoteModalVisible(true);
        });
      }
      setPalmTimeFocus('start');
      setPalmPickerPm(s.pm);
      if (initialTarget === 'time' && !reminder.noTime && !reminder.allDay) {
        queueMicrotask(() => {
          detailsPalmSnapshotRef.current = {
            startHour: String(s.hour),
            startMin: String(s.min).padStart(2, '0'),
            startPm: s.pm,
            endHour: String(e.hour),
            endMin: String(e.min).padStart(2, '0'),
            endPm: e.pm,
            allDay: Boolean(reminder.allDay),
            noTime: Boolean(reminder.noTime),
          };
          setDetailsPalmPickerVisible(true);
        });
      } else {
        setDetailsPalmPickerVisible(false);
      }
      return;
    }
    setDateISO(defaultDate);
    setAllDay(false);
    setNoTime(false);
    // Hora-primero: si se tocó una franja concreta, prellenar el selector con esa hora (modificable).
    if (defaultStartTime && defaultStartTime.includes(':')) {
      const s = time24To12(defaultStartTime);
      const e = time24To12(addHour(defaultStartTime));
      setStartHour(String(s.hour));
      setStartMin(String(s.min).padStart(2, '0'));
      setStartPm(s.pm);
      setEndHour(String(e.hour));
      setEndMin(String(e.min).padStart(2, '0'));
      setEndPm(e.pm);
      setPalmPickerPm(s.pm);
    } else {
      setStartHour('');
      setStartMin('');
      setStartPm(false);
      setEndHour('');
      setEndMin('');
      setEndPm(false);
      setPalmPickerPm(false);
    }
    setAlarm(true);
    setAlarmOffsetStr('5');
    setAlarmUnit('minutes');
    setRepeat('none');
    setRepeatInterval(1);
    setRepeatEndDate(undefined);
    setRepeatWeekdays(undefined);
    setNote('');
    setLocation('');
    setCategory('');
    setNoteModalVisible(false);
    setPalmTimeFocus('start');
  }, [visible, reminder, defaultDate, defaultStartTime, initialTarget]);

  useEffect(() => {
    if (!visible || initialTarget !== 'alarm') return;
    const t = setTimeout(() => {
      detailsScrollRef.current?.scrollTo({
        y: Math.max(0, alarmSectionY.current - 16),
        animated: true,
      });
    }, 280);
    return () => clearTimeout(t);
  }, [visible, initialTarget, reminder?.id]);

  const parseHour = (v: string): number | null => {
    const n = parseInt(v.trim(), 10);
    if (v.trim() === '' || Number.isNaN(n)) return null;
    return Math.max(1, Math.min(12, n));
  };
  const parseMin = (v: string): number | null => {
    const n = parseInt(v.trim(), 10);
    if (v.trim() === '' || Number.isNaN(n)) return null;
    return Math.max(0, Math.min(59, n));
  };

  /** Al elegir hora en el selector Palm: inicio → min :00 y fin +1 h; fin → min :00. */
  const applyPalmHourSelection = (row: PalmHourRow, hourListIsPm: boolean) => {
    if (palmTimeFocus === 'start') {
      setStartHour(String(row.hour));
      setStartPm(row.pm);
      setStartMin('00');
      const start24 = time12To24(row.hour, 0, row.pm);
      const end24 = addHour(start24);
      const e = time24To12(end24);
      setEndHour(String(e.hour));
      setEndMin(String(e.min).padStart(2, '0'));
      setEndPm(e.pm);
    } else {
      setEndHour(String(row.hour));
      setEndPm(row.pm);
      setEndMin('00');
    }
    setPalmPickerPm(hourListIsPm);
  };

  const getRepeatPayload = () =>
    repeat === 'none'
      ? {
          repeat: 'none' as const,
          repeatInterval: undefined,
          repeatEndDate: undefined,
          repeatWeekdays: undefined,
        }
      : {
          repeat,
          repeatInterval: Math.max(1, repeatInterval),
          repeatEndDate: repeatEndDate?.trim() || undefined,
          repeatWeekdays:
            repeat === 'weekly' && repeatWeekdays?.length
              ? [...repeatWeekdays].sort((a, b) => a - b)
              : undefined,
        };

  const performSave = async (p: {
    payloadNoTime: boolean;
    payloadAllDay: boolean;
    startTime: string;
    endTime: string;
  }) => {
    const isNewEvent = reminder === null;
    const title = isNewEvent ? defaultTitle.trim() : (reminder.title?.trim() || 'Evento');
    const repeatPayload = getRepeatPayload();
    const { payloadNoTime, payloadAllDay, startTime, endTime } = p;

    let saveAlarm = false;
    let saveAlarmOffset: number | undefined;
    let saveAlarmUnit: AlarmUnit | undefined;
    if (!payloadNoTime && alarm) {
      const offset = parseInt(alarmOffsetStr.trim(), 10);
      if (!Number.isFinite(offset) || offset < 1) {
        Alert.alert('Alarma', 'Indica un anticipo mayor que cero (número entero).');
        return;
      }
      if (offset > 9999) {
        Alert.alert('Alarma', 'El valor es demasiado grande.');
        return;
      }
      saveAlarm = true;
      saveAlarmOffset = offset;
      saveAlarmUnit = alarmUnit;
    }

    await Promise.resolve(
      onSave(reminder?.id ?? null, {
        title,
        startTime,
        endTime,
        date: dateISO,
        alarm: saveAlarm,
        alarmOffset: saveAlarmOffset,
        alarmUnit: saveAlarmUnit,
        allDay: payloadAllDay,
        noTime: payloadNoTime,
        ...repeatPayload,
        note: note.trim() || undefined,
        location: location.trim() || undefined,
        category: category.trim() || undefined,
      })
    );
    onClose();
  };

  /** Solo flujo Palm «Nuevo»: guardar y cerrar al elegir Todo el día o Sin hora (sin pulsar OK). */
  const commitQuickSaveForNew = async (mode: 'allDay' | 'noTime') => {
    if (reminder !== null || !dateISO) return;
    if (mode === 'noTime') {
      await performSave({
        payloadNoTime: true,
        payloadAllDay: false,
        startTime: '00:00',
        endTime: '00:00',
      });
    } else {
      const { startHour: sh, endHour: eh } = getDayVisibleRange(dateISO);
      const range = dayVisibleRangeToTimes(sh, eh);
      await performSave({
        payloadNoTime: false,
        payloadAllDay: true,
        startTime: range.startTime,
        endTime: range.endTime,
      });
    }
  };

  const handleOK = async () => {
    if (noTime) {
      await performSave({
        payloadNoTime: true,
        payloadAllDay: false,
        startTime: '00:00',
        endTime: '00:00',
      });
      return;
    }
    if (allDay) {
      const { startHour: sh, endHour: eh } = getDayVisibleRange(dateISO);
      const range = dayVisibleRangeToTimes(sh, eh);
      await performSave({
        payloadNoTime: false,
        payloadAllDay: true,
        startTime: range.startTime,
        endTime: range.endTime,
      });
      return;
    }

    const sh = parseHour(startHour);
    const sm = parseMin(startMin);
    const eh = parseHour(endHour);
    const em = parseMin(endMin);
    if (sh === null || sm === null || eh === null || em === null) {
      Alert.alert('Horario requerido', 'Revisa hora de inicio y fin.');
      return;
    }
    const startTime = time12To24(sh, sm, startPm);
    const endTime = time12To24(eh, em, endPm);
    await performSave({
      payloadNoTime: false,
      payloadAllDay: false,
      startTime,
      endTime,
    });
  };

  const onlyDigits = (v: string) => v.replace(/[^0-9]/g, '');

  const styles = useMemo(
    () =>
      StyleSheet.create({
        baseText: { fontFamily: 'PixelOperator', fontWeight: 'normal' as const },
        overlay: { flex: 1, justifyContent: 'flex-end' as const, width: '100%' as const },
        overlayCenter: {
          flex: 1,
          width: '100%' as const,
          justifyContent: 'center' as const,
          alignItems: 'center' as const,
          paddingHorizontal: 14,
          paddingVertical: 20,
        },
        newEventBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.backdrop },
        newEventCard: {
          width: '100%' as const,
          maxWidth: 440,
          maxHeight: '92%' as const,
          backgroundColor: colors.cardBackground,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 0,
          paddingHorizontal: 18,
          paddingTop: 14,
          paddingBottom: 18,
          overflow: 'hidden' as const,
          zIndex: 2,
        },
        /** Misma tarjeta centrada que «Nuevo», para detalles del evento. */
        detailsCenterCard: {
          width: '100%' as const,
          maxWidth: 440,
          maxHeight: '92%' as const,
          backgroundColor: '#ffffff',
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 0,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 10,
          overflow: 'visible' as const,
          zIndex: 2,
        },
        backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.backdrop },
        box: {
          backgroundColor: colors.cardBackground,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 28,
          maxHeight: '88%',
          width: '100%' as const,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 20,
        },
        headerTitle: { fontSize: fs(18), color: colors.text, ...titleFont },
        sectionTitle: {
          fontSize: fs(13),
          color: colors.textSecondary,
          marginBottom: 10,
          marginTop: 4,
          ...titleFont,
        },
        /** Contenedor con borde para agrupar título + opciones */
        sectionBlock: {
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 0,
          padding: 12,
          marginBottom: 12,
          backgroundColor: colors.fieldFill,
        },
        /** Título de sección con línea inferior */
        sectionTitleBordered: {
          fontSize: fs(12),
          ...titleFont,
          color: colors.textSecondary,
          letterSpacing: 0.4,
          textTransform: 'uppercase' as const,
          marginBottom: 10,
          paddingBottom: 8,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.line,
        },
        titleText: { fontSize: fs(16), color: colors.text, marginTop: 2, ...titleFont },
        titleInput: {
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 0,
          paddingHorizontal: 10,
          paddingVertical: 10,
          marginTop: 4,
          backgroundColor: colors.cardBackground,
        },
        timeGroup: {
          paddingTop: 4,
          paddingBottom: 0,
        },
        timeRangeText: { fontSize: fs(15), color: colors.text, marginBottom: 12, fontFamily: 'PixelOperator', fontWeight: 'normal' },
        timeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
        timeRowLabel: { fontSize: fs(12), color: colors.textSecondary, width: 36, fontFamily: 'PixelOperator', fontWeight: 'normal' },
        row: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 },
        optionRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          paddingVertical: 4,
        },
        label: { fontSize: fs(14), color: colors.textSecondary, minWidth: 70, fontFamily: 'PixelOperator', fontWeight: 'normal' },
        dateInfo: { fontSize: fs(14), color: colors.text, flex: 1, fontFamily: 'PixelOperator', fontWeight: 'normal' },
        timeGroupInline: { flexDirection: 'row', alignItems: 'center', gap: 2 },
        alarmCheckbox: { width: 20, height: 20 },
        actions: {
          flexDirection: 'row',
          flexWrap: 'nowrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          marginTop: 20,
          paddingTop: 16,
          borderTopWidth: 1,
          borderTopColor: colors.line,
        },
        btn: {
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.footerText,
          backgroundColor: colors.screenBackground,
        },
        btnText: { fontSize: fs(14), color: colors.footerText, fontFamily: 'PixelOperator', fontWeight: 'normal' },
        btnTextDanger: { color: '#c62828' },
        timeInputsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'wrap' },
        timeInputSmall: {
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 0,
          paddingHorizontal: 8,
          paddingVertical: 8,
          fontSize: fs(14),
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
          color: colors.text,
          minWidth: 40,
          textAlign: 'center',
        },
        timeColon: { fontSize: fs(16), color: colors.textSecondary, marginHorizontal: 0, fontFamily: 'PixelOperator', fontWeight: 'normal' },
        ampmBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 0, borderWidth: 1, borderColor: colors.line },
        ampmBtnActive: { backgroundColor: colors.daySelectedBg, borderColor: colors.daySelectedBg },
        ampmText: { fontSize: fs(12), color: colors.textSecondary, fontFamily: 'PixelOperator', fontWeight: 'normal' },
        ampmTextActive: { color: colors.onAccentBg },
        noteModalRoot: { flex: 1 },
        noteModalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.backdrop },
        noteModalCenter: {
          flex: 1,
          justifyContent: 'center' as const,
          alignItems: 'center' as const,
          padding: 24,
        },
        noteModalCard: {
          width: '100%' as const,
          maxWidth: 400,
          backgroundColor: colors.cardBackground,
          borderRadius: 0,
          padding: 18,
          borderWidth: 1,
          borderColor: colors.line,
          zIndex: 1,
        },
        noteModalTitle: {
          fontSize: fs(17),
          color: colors.text,
          marginBottom: 12,
          ...titleFont,
        },
        noteModalInput: {
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 0,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: fs(15),
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
          color: colors.text,
          minHeight: 140,
          maxHeight: 220,
          textAlignVertical: 'top',
        },
        noteModalActions: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginTop: 16,
        },
        noteModalActionsEnd: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginLeft: 'auto' },
        noteModalBtn: {
          paddingVertical: 10,
          paddingHorizontal: 18,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.footerText,
          backgroundColor: colors.screenBackground,
        },
        noteModalBtnDanger: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 0, borderWidth: 1.5, borderColor: '#c62828' },
        alarmOptionsBlock: { marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingLeft: 0 },
        alarmAnticipationLabel: {
          fontSize: fs(13),
          color: colors.textSecondary,
          marginBottom: 8,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
        },
        alarmAnticipationRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
        alarmOffsetInput: {
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 0,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: fs(16),
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
          color: colors.text,
          minWidth: 64,
          maxWidth: 88,
          textAlign: 'center' as const,
        },
        alarmUnitMenu: {
          position: 'absolute' as const,
          top: 32,
          left: 0,
          right: 0,
          backgroundColor: colors.cardBackground,
          borderWidth: 1,
          borderColor: colors.line,
          zIndex: 20,
          elevation: 8,
        },
        alarmUnitMenuOption: {
          paddingVertical: 12,
          paddingHorizontal: 10,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.line,
        },
        alarmUnitMenuOptionText: {
          fontSize: fs(14),
          color: colors.text,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal' as const,
        },
        categoryMenu: {
          position: 'absolute' as const,
          backgroundColor: colors.cardBackground,
          borderWidth: 1,
          borderColor: colors.line,
          maxHeight: 220,
          zIndex: 2,
          elevation: 12,
        },
        categoryMenuOverlay: {
          ...StyleSheet.absoluteFillObject,
          zIndex: 100,
          elevation: 20,
        },
        categoryMenuScroll: {
          maxHeight: 220,
        },
        categoryMenuOption: {
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          gap: 8,
          paddingVertical: 10,
          paddingHorizontal: 10,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.line,
        },
        categoryMenuOptionSelected: {
          backgroundColor: colors.daySelectedBg,
        },
        categoryMenuOptionText: {
          fontSize: fs(14),
          color: colors.text,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal' as const,
          flex: 1,
        },
        categoryMenuOptionTextSelected: {
          color: colors.onAccentBg,
        },
        categoryMenuSeparator: {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.strongBorder,
          marginTop: 2,
        },
        floatingMenu: {
          position: 'absolute' as const,
          backgroundColor: colors.cardBackground,
          borderWidth: 1,
          borderColor: colors.line,
          zIndex: 2,
          elevation: 24,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.22,
          shadowRadius: 8,
        },
        floatingMenuScroll: {
          flexGrow: 0,
        },
        categoryFieldRow: {
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          gap: 8,
          flex: 1,
        },
        palmRoot: {
          flexDirection: 'row' as const,
          alignItems: 'flex-start' as const,
          justifyContent: 'space-between' as const,
          marginTop: 8,
          width: '100%' as const,
          alignSelf: 'stretch' as const,
        },
        palmLeft: {
          flex: 1,
          flexGrow: 1,
          flexShrink: 1,
          minWidth: 136,
          paddingRight: 8,
        },
        palmSubHeaderRow: {
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          justifyContent: 'space-between' as const,
          marginBottom: 8,
        },
        palmSetTimeTitle: {
          fontSize: fs(15),
          color: colors.text,
          ...titleFont,
        },
        palmHelpIcon: { fontSize: fs(16), color: colors.textSecondary, padding: 4 },
        palmFieldLabel: {
          fontSize: fs(12),
          color: colors.textSecondary,
          marginBottom: 4,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal' as const,
        },
        palmDisplayBox: {
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: colors.fieldFill,
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 0,
        },
        palmDisplayBoxActive: {
          borderColor: colors.daySelectedBg,
          borderWidth: 2,
          backgroundColor: colors.cardBackground,
        },
        palmDisplayText: {
          fontSize: fs(16),
          color: colors.text,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal' as const,
        },
        palmBigActions: { marginTop: 14, gap: 8 },
        palmBigBtn: {
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: colors.fieldFill,
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderRadius: 0,
        },
        palmBigBtnActive: {
          backgroundColor: colors.daySelectedBg,
          borderColor: colors.daySelectedBg,
        },
        palmBigBtnText: {
          fontSize: fs(15),
          color: colors.text,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal' as const,
          textAlign: 'center' as const,
        },
        palmBigBtnTextActive: { color: colors.onAccentBg },
        palmBottomBar: {
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          gap: 12,
          marginTop: 16,
          paddingTop: 12,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.line,
        },
        palmBarBtn: {
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.footerText,
          backgroundColor: colors.screenBackground,
        },
        palmBarOkText: {
          fontSize: fs(16),
          color: colors.footerText,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal' as const,
        },
        palmBarCancelText: {
          fontSize: fs(16),
          color: colors.footerText,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal' as const,
        },
        palmRight: {
          flexDirection: 'row' as const,
          alignItems: 'flex-start' as const,
          justifyContent: 'flex-end' as const,
          flexShrink: 0,
          flexGrow: 0,
          width: 146,
          minWidth: 146,
          maxWidth: 146,
          paddingTop: 0,
          gap: 10,
        },
        palmColWrap: { alignItems: 'center' as const, flexShrink: 0 },
        palmMeridianArrow: {
          fontSize: fs(14),
          color: colors.textSecondary,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal' as const,
        },
        palmScrollCol: {
          width: 68,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: colors.fieldFill,
          flexGrow: 0,
          flexShrink: 0,
          overflow: 'hidden' as const,
          flexDirection: 'column' as const,
        },
        palmColumnInner: {
          flex: 1,
          flexDirection: 'column' as const,
          minHeight: 0,
        },
        palmTwelveWithArrow: {
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
          gap: 2,
        },
        palmArrowBeside12: {
          paddingHorizontal: 4,
          paddingVertical: 2,
          justifyContent: 'center' as const,
          alignItems: 'center' as const,
        },
        palmRowCell: {
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
        },
        palmScrollItem: {
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
        },
        palmScrollItemActive: {
          backgroundColor: colors.daySelectedBg,
        },
        palmScrollItemText: {
          fontSize: fs(16),
          color: colors.text,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal' as const,
        },
        pdScroll: { flex: 1, backgroundColor: colors.viewScreenBackground },
        pdBodyPad: {
          paddingHorizontal: 4,
          paddingTop: 6,
          paddingBottom:
            10 +
            (keyboardPad > 0 ? MODAL_KEYBOARD_EXTRA : 0) +
            (Platform.OS === 'android' ? keyboardPad : Math.round(keyboardPad * 0.52)),
        },
        pdRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, marginBottom: 8, gap: 6 },
        pdLabel: {
          width: 96,
          fontSize: fs(13),
          fontFamily: 'PixelOperator',
          fontWeight: 'normal' as const,
          color: colors.textSecondary,
          paddingTop: 6,
        },
        /** Columna que envuelve el valor del campo + su subrayado de puntos. */
        pdFieldCol: { flex: 1 },
        /** Fila del valor (sin caja; solo subrayado inferior). */
        pdFieldRow: {
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          minHeight: 28,
          paddingHorizontal: 2,
          paddingVertical: 4,
          backgroundColor: '#ffffff',
        },
        pdPickerRow: {
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          minHeight: 20,
        },
        /** Flecha ▼ visible al final de cada selector. */
        pdFieldChevron: { fontSize: fs(11), color: colors.textSecondary, marginLeft: 8 },
        /** Subrayado de puntos (línea inferior). */
        fieldUnderline: { flexDirection: 'row' as const, overflow: 'hidden' as const, height: 2 },
        fieldUnderlineDot: { width: 2, height: 2, marginRight: 3, backgroundColor: colors.textSecondary },
        /** Alarma en una sola fila: ancho fijo para número y unidad (el subrayado no ensancha). */
        alarmNumberCol: { width: 44 },
        alarmUnitCol: { flex: 1, minWidth: 96, position: 'relative' as const },
        alarmFieldsRow: { flex: 1, flexDirection: 'row' as const, gap: 8, alignItems: 'flex-end' as const },
        /** Checkbox + campos alineados con el resto de filas Palm (pdLabel paddingTop). */
        alarmInlineControls: {
          flex: 1,
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          gap: 8,
          marginTop: 6,
          minHeight: 28,
        },
        alarmCheckboxWrap: { height: 28, justifyContent: 'center' as const },
        /** Altura fija para que número, unidad y subrayado queden a la misma altura. */
        alarmFieldContent: {
          height: 28,
          justifyContent: 'center' as const,
          paddingHorizontal: 2,
          backgroundColor: '#ffffff',
        },
        alarmNumberInput: {
          height: 28,
          minHeight: 28,
          paddingVertical: 0,
          paddingTop: 0,
          paddingBottom: 0,
          textAlignVertical: 'center' as const,
          ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
        },
        alarmUnitRow: { height: 28, minHeight: 28, paddingVertical: 0 },
        pdFieldText: {
          fontSize: fs(14),
          fontFamily: 'PixelOperator',
          fontWeight: 'normal' as const,
          color: colors.text,
          marginBottom: 0,
        },
        pdFieldTextEmphasis: {
          fontSize: fs(15),
          fontFamily: 'PixelOperator',
          fontWeight: 'normal' as const,
          color: colors.text,
        },
        pdMiniRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, marginTop: 6 },
        pdMiniToggle: {
          paddingVertical: 5,
          paddingHorizontal: 10,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: colors.cardBackground,
        },
        pdMiniToggleOn: { backgroundColor: colors.todayCellBg, borderColor: colors.daySelectedBg },
        pdMiniToggleText: { fontSize: fs(12), fontFamily: 'PixelOperator', fontWeight: 'normal' as const, color: colors.text },
        pdCheckboxRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 8, gap: 8 },
        /** Cabecera azul "Detalles de la cita" (sangra a los bordes de la tarjeta). */
        palmModalHeader: {
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          backgroundColor: colors.agendaDateChipBg,
          paddingHorizontal: 10,
          paddingVertical: 7,
          marginHorizontal: -16,
          marginTop: -12,
          marginBottom: 10,
        },
        palmModalHeaderTitle: {
          flex: 1,
          textAlign: 'center' as const,
          fontSize: fs(15),
          color: colors.agendaDateChipText,
          ...titleFont,
        },
        palmHeaderRight: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
        // Sin PixelOperator: la fuente pixel no trae ⓘ/✕; uso la del sistema.
        palmHeaderInfo: { fontSize: fs(15), color: colors.agendaDateChipText },
        palmHeaderClose: {
          fontSize: fs(17),
          color: colors.agendaDateChipText,
          paddingHorizontal: 4,
        },
        pdFieldInput: {
          backgroundColor: '#ffffff',
          paddingHorizontal: 2,
          paddingVertical: 4,
          minHeight: 28,
          fontSize: fs(14),
          fontFamily: 'PixelOperator',
          fontWeight: 'normal' as const,
          color: colors.text,
        },
        palmScrollItemTextActive: { color: colors.onAccentBg },
      }),
    [colors, fontScale]
  );

  const renderUnderline = () => (
    <View style={styles.fieldUnderline} pointerEvents="none">
      {UNDERLINE_DOTS.map((_, i) => (
        <View key={i} style={styles.fieldUnderlineDot} />
      ))}
    </View>
  );

  const openNoteModal = () => {
    setAlarmUnitPickerVisible(false);
    closeCategoryPicker();
    closeRepeatPicker();
    setNoteDraft(note);
    setNoteModalVisible(true);
  };

  const confirmNoteModal = () => {
    setNote(noteDraft.trim());
    setNoteModalVisible(false);
  };

  const dismissNoteModal = () => {
    setNoteModalVisible(false);
  };

  const clearNoteFromModal = () => {
    setNote('');
    setNoteDraft('');
    setNoteModalVisible(false);
  };

  const toggleAllDay = () => {
    if (reminder === null) {
      if (allDay) {
        setAllDay(false);
        return;
      }
      void commitQuickSaveForNew('allDay');
      return;
    }
    if (allDay) {
      setAllDay(false);
    } else {
      setNoTime(false);
      setAllDay(true);
    }
  };

  const toggleNoTime = () => {
    if (reminder === null) {
      if (noTime) {
        setNoTime(false);
        return;
      }
      void commitQuickSaveForNew('noTime');
      return;
    }
    if (noTime) {
      setNoTime(false);
    } else {
      setAllDay(false);
      setNoTime(true);
      setAlarm(false);
    }
  };

  const alarmUnitLabel = ALARM_UNIT_OPTIONS.find((o) => o.value === alarmUnit)?.label ?? 'Minutos';

  const allDayRangeSummary = useMemo(() => {
    if (!dateISO) return '';
    const { startHour: sh, endHour: eh } = getDayVisibleRange(dateISO);
    const { startTime: st, endTime: et } = dayVisibleRangeToTimes(sh, eh);
    return `De ${formatTime12h(st)} a ${formatTime12h(et)} (horario del día en la agenda)`;
  }, [dateISO, getDayVisibleRange]);

  const editTimeSummary = useMemo(() => {
    if (noTime) return 'Sin hora';
    if (allDay) return 'Todo el día';
    const sh = parseHour(startHour);
    const sm = parseMin(startMin);
    const eh = parseHour(endHour);
    const em = parseMin(endMin);
    if (sh === null || sm === null || eh === null || em === null) return '—';
    const st = time12To24(sh, sm, startPm);
    const et = time12To24(eh, em, endPm);
    return `${formatTime12hCompact(st)} - ${formatTime12hCompact(et)}`;
  }, [noTime, allDay, startHour, startMin, startPm, endHour, endMin, endPm]);

  const handleDeletePress = () => {
    if (!reminder?.id || !onDelete) return;
    Alert.alert('Eliminar', '¿Eliminar este evento?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          void Promise.resolve(onDelete(reminder.id));
        },
      },
    ]);
  };

  const openDetailsPalmPicker = () => {
    detailsPalmSnapshotRef.current = {
      startHour,
      startMin,
      startPm,
      endHour,
      endMin,
      endPm,
      allDay,
      noTime,
    };
    setPalmTimeFocus('start');
    if (startHour.trim() !== '') setPalmPickerPm(startPm);
    setAlarmUnitPickerVisible(false);
    closeRepeatPicker();
    setDetailsPalmPickerVisible(true);
  };

  const closeDetailsPalmPicker = (apply: boolean) => {
    if (!apply && detailsPalmSnapshotRef.current) {
      const s = detailsPalmSnapshotRef.current;
      setStartHour(s.startHour);
      setStartMin(s.startMin);
      setStartPm(s.startPm);
      setEndHour(s.endHour);
      setEndMin(s.endMin);
      setEndPm(s.endPm);
      setAllDay(s.allDay);
      setNoTime(s.noTime);
    }
    detailsPalmSnapshotRef.current = null;
    setDetailsPalmPickerVisible(false);
  };

  if (!visible) return null;

  const showTimePickers = !noTime && !allDay;
  /** Solo muestra texto cuando hay hora y minuto elegidos (Nuevo: empieza vacío). */
  const palmStartReadout =
    startHour.trim() === '' || startMin.trim() === ''
      ? ''
      : `${startHour}:${startMin.padStart(2, '0')} ${startPm ? 'p.m.' : 'a.m.'}`;
  const palmEndReadout =
    endHour.trim() === '' || endMin.trim() === ''
      ? ''
      : `${endHour}:${endMin.padStart(2, '0')} ${endPm ? 'p.m.' : 'a.m.'}`;
  /** Altura alineada a filas fijas (evita overflow/ghosting en Android con fuente grande). */
  const palmColBudget = Math.min(
    480,
    Math.max(300, Math.floor((windowHeight - insets.top - insets.bottom - 100) * 0.48))
  );
  const palmRowHeight = Math.max(26, Math.floor(palmColBudget / PALM_PICKER_ROW_COUNT));
  const palmColHeight = palmRowHeight * PALM_PICKER_ROW_COUNT;
  const palmRowStyle = { height: palmRowHeight };

  const renderPalmTimePickers = (onPalmOk: () => void, onPalmCancel: () => void) => (
    <>
      {showTimePickers ? (
                  <View style={styles.palmRoot}>
                    <View style={styles.palmLeft}>
                      <Text style={styles.palmFieldLabel}>Inicio</Text>
                      <Pressable
                        style={({ pressed }) => [
                          styles.palmDisplayBox,
                          palmTimeFocus === 'start' && styles.palmDisplayBoxActive,
                          pressed && { opacity: 0.88 },
                        ]}
                        onPress={() => {
                          setPalmTimeFocus('start');
                          if (startHour.trim() !== '') setPalmPickerPm(startPm);
                        }}
                      >
                        <Text style={styles.palmDisplayText}>{palmStartReadout}</Text>
                      </Pressable>
                      <Text style={[styles.palmFieldLabel, { marginTop: 10 }]}>Fin</Text>
                      <Pressable
                        style={({ pressed }) => [
                          styles.palmDisplayBox,
                          palmTimeFocus === 'end' && styles.palmDisplayBoxActive,
                          pressed && { opacity: 0.88 },
                        ]}
                        onPress={() => {
                          setPalmTimeFocus('end');
                          if (endHour.trim() !== '') setPalmPickerPm(endPm);
                        }}
                      >
                        <Text style={styles.palmDisplayText}>{palmEndReadout}</Text>
                      </Pressable>
                      <View style={styles.palmBigActions}>
                        <TouchableOpacity
                          style={[styles.palmBigBtn, allDay && styles.palmBigBtnActive]}
                          onPress={toggleAllDay}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.palmBigBtnText, allDay && styles.palmBigBtnTextActive]}>
                            Todo el día
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.palmBigBtn, noTime && styles.palmBigBtnActive]}
                          onPress={toggleNoTime}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.palmBigBtnText, noTime && styles.palmBigBtnTextActive]}>
                            Sin hora
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.palmBottomBar}>
                        <TouchableOpacity style={styles.palmBarBtn} onPress={() => void onPalmOk()}>
                          <Text style={styles.palmBarOkText}>OK</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.palmBarBtn} onPress={onPalmCancel}>
                          <Text style={styles.palmBarCancelText}>Cancelar</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.palmRight}>
                      <View style={styles.palmColWrap}>
                        <View style={[styles.palmScrollCol, { height: palmColHeight }]}>
                          <View style={styles.palmColumnInner}>
                            {!palmPickerPm ? (
                              <>
                                {(() => {
                                  const row = PALM_HOUR_ROWS_AM[0];
                                  const h = palmTimeFocus === 'start' ? startHour : endHour;
                                  const pmSel = palmTimeFocus === 'start' ? startPm : endPm;
                                  const hn = h.trim() === '' ? null : parseHour(h);
                                  const active = hn === row.hour && pmSel === row.pm;
                                  return (
                                    <Pressable
                                      key="am-12"
                                      style={({ pressed }) => [
                                        styles.palmRowCell,
                                        palmRowStyle,
                                        styles.palmScrollItem,
                                        active && styles.palmScrollItemActive,
                                        pressed && { opacity: 0.85 },
                                      ]}
                                      onPress={() => applyPalmHourSelection(row, false)}
                                    >
                                      <Text
                                        style={[styles.palmScrollItemText, active && styles.palmScrollItemTextActive]}
                                      >
                                        {row.label}
                                      </Text>
                                    </Pressable>
                                  );
                                })()}
                                {PALM_HOUR_ROWS_AM.slice(1, 11).map((row) => {
                                  const h = palmTimeFocus === 'start' ? startHour : endHour;
                                  const pmSel = palmTimeFocus === 'start' ? startPm : endPm;
                                  const hn = h.trim() === '' ? null : parseHour(h);
                                  const active = hn === row.hour && pmSel === row.pm;
                                  return (
                                    <Pressable
                                      key={`am-${row.label}`}
                                      style={({ pressed }) => [
                                        styles.palmRowCell,
                                        palmRowStyle,
                                        styles.palmScrollItem,
                                        active && styles.palmScrollItemActive,
                                        pressed && { opacity: 0.85 },
                                      ]}
                                      onPress={() => applyPalmHourSelection(row, false)}
                                    >
                                      <Text
                                        style={[styles.palmScrollItemText, active && styles.palmScrollItemTextActive]}
                                      >
                                        {row.label}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                                {(() => {
                                  const row = PALM_HOUR_ROWS_AM[11];
                                  const h = palmTimeFocus === 'start' ? startHour : endHour;
                                  const pmSel = palmTimeFocus === 'start' ? startPm : endPm;
                                  const hn = h.trim() === '' ? null : parseHour(h);
                                  const active = hn === row.hour && pmSel === row.pm;
                                  return (
                                    <View
                                      key="am-11-arrow"
                                      style={[
                                        styles.palmRowCell,
                                        palmRowStyle,
                                        styles.palmScrollItem,
                                        styles.palmTwelveWithArrow,
                                        active && styles.palmScrollItemActive,
                                      ]}
                                    >
                                      <Pressable
                                        style={({ pressed }) => [
                                          { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
                                          pressed && { opacity: 0.85 },
                                        ]}
                                        onPress={() => applyPalmHourSelection(row, false)}
                                      >
                                        <Text
                                          style={[
                                            styles.palmScrollItemText,
                                            active && styles.palmScrollItemTextActive,
                                          ]}
                                        >
                                          {row.label}
                                        </Text>
                                      </Pressable>
                                      <TouchableOpacity
                                        style={styles.palmArrowBeside12}
                                        onPress={() => setPalmPickerPm(true)}
                                        hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                                        accessibilityLabel="Ver horas de la tarde"
                                      >
                                        <Text style={styles.palmMeridianArrow}>↓</Text>
                                      </TouchableOpacity>
                                    </View>
                                  );
                                })()}
                              </>
                            ) : (
                              <>
                                {(() => {
                                  const row = PALM_HOUR_ROWS_PM[0];
                                  const h = palmTimeFocus === 'start' ? startHour : endHour;
                                  const pmSel = palmTimeFocus === 'start' ? startPm : endPm;
                                  const hn = h.trim() === '' ? null : parseHour(h);
                                  const active = hn === row.hour && pmSel === row.pm;
                                  return (
                                    <View
                                      key="pm-12-arrow"
                                      style={[
                                        styles.palmRowCell,
                                        palmRowStyle,
                                        styles.palmScrollItem,
                                        styles.palmTwelveWithArrow,
                                        active && styles.palmScrollItemActive,
                                      ]}
                                    >
                                      <TouchableOpacity
                                        style={styles.palmArrowBeside12}
                                        onPress={() => setPalmPickerPm(false)}
                                        hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                                        accessibilityLabel="Ver horas de la mañana"
                                      >
                                        <Text style={styles.palmMeridianArrow}>↑</Text>
                                      </TouchableOpacity>
                                      <Pressable
                                        style={({ pressed }) => [
                                          { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
                                          pressed && { opacity: 0.85 },
                                        ]}
                                        onPress={() => applyPalmHourSelection(row, true)}
                                      >
                                        <Text
                                          style={[
                                            styles.palmScrollItemText,
                                            active && styles.palmScrollItemTextActive,
                                          ]}
                                        >
                                          {row.label}
                                        </Text>
                                      </Pressable>
                                    </View>
                                  );
                                })()}
                                {PALM_HOUR_ROWS_PM.slice(1).map((row) => {
                                  const h = palmTimeFocus === 'start' ? startHour : endHour;
                                  const pmSel = palmTimeFocus === 'start' ? startPm : endPm;
                                  const hn = h.trim() === '' ? null : parseHour(h);
                                  const active = hn === row.hour && pmSel === row.pm;
                                  return (
                                    <Pressable
                                      key={`pm-${row.label}`}
                                      style={({ pressed }) => [
                                        styles.palmRowCell,
                                        palmRowStyle,
                                        styles.palmScrollItem,
                                        active && styles.palmScrollItemActive,
                                        pressed && { opacity: 0.85 },
                                      ]}
                                      onPress={() => applyPalmHourSelection(row, true)}
                                    >
                                      <Text
                                        style={[styles.palmScrollItemText, active && styles.palmScrollItemTextActive]}
                                      >
                                        {row.label}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </>
                            )}
                          </View>
                        </View>
                      </View>
                      <View style={[styles.palmScrollCol, { height: palmColHeight }]}>
                        <View style={styles.palmColumnInner}>
                          {PALM_MINUTE_STEPS.map((mm) => {
                            const mNow = palmTimeFocus === 'start' ? startMin : endMin;
                            const hasMin = mNow.trim() !== '';
                            const active = hasMin && mNow.padStart(2, '0') === mm;
                            return (
                              <Pressable
                                key={mm}
                                style={({ pressed }) => [
                                  styles.palmRowCell,
                                  palmRowStyle,
                                  styles.palmScrollItem,
                                  active && styles.palmScrollItemActive,
                                  pressed && { opacity: 0.85 },
                                ]}
                                onPress={() => {
                                  if (palmTimeFocus === 'start') setStartMin(mm);
                                  else setEndMin(mm);
                                }}
                              >
                                <Text style={[styles.palmScrollItemText, active && styles.palmScrollItemTextActive]}>
                                  {mm}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View style={{ paddingTop: 8, paddingHorizontal: 2, gap: 10 }}>
                    <TouchableOpacity
                      style={[styles.palmBigBtn, allDay && styles.palmBigBtnActive]}
                      onPress={toggleAllDay}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.palmBigBtnText, allDay && styles.palmBigBtnTextActive]}>Todo el día</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.palmBigBtn, noTime && styles.palmBigBtnActive]}
                      onPress={toggleNoTime}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.palmBigBtnText, noTime && styles.palmBigBtnTextActive]}>Sin hora</Text>
                    </TouchableOpacity>
                    <View style={[styles.palmBottomBar, { marginTop: 8 }]}>
                      <TouchableOpacity style={styles.palmBarBtn} onPress={() => void onPalmOk()}>
                        <Text style={styles.palmBarOkText}>OK</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.palmBarBtn} onPress={onPalmCancel}>
                        <Text style={styles.palmBarCancelText}>Cancelar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
    </>
  );

  if (!visible) return null;

  if (editCategoriesVisible) {
    return (
      <EditCategoriesScreen
        onDismiss={() => setEditCategoriesVisible(false)}
        onSaved={refreshCategories}
      />
    );
  }

  if (repeatEndDateQuickPickerVisible) {
    return (
      <GoToDateScreen
        title="Diario hasta"
        initialDate={
          repeatEndDate && /^\d{4}-\d{2}-\d{2}$/.test(repeatEndDate)
            ? repeatEndDate
            : dateISO || defaultDate
        }
        reminders={[]}
        onSelectDate={confirmRepeatEndDateQuickPicker}
        onClose={dismissRepeatEndDateQuickPicker}
      />
    );
  }

  if (repeatModalVisible) {
    return (
      <ChangeRepeatScreen
        frequency={repeat ?? 'none'}
        interval={repeatInterval}
        endDateISO={repeatEndDate}
        weekdays={repeatWeekdays}
        eventDateISO={dateISO}
        onApply={(f, int, end, days) => {
          setRepeat(f);
          setRepeatInterval(int);
          setRepeatEndDate(end);
          setRepeatWeekdays(f === 'weekly' && days?.length ? days : undefined);
          setRepeatModalVisible(false);
        }}
        onDismiss={() => setRepeatModalVisible(false)}
      />
    );
  }

  if (noteModalVisible) {
    const noteFooter = (
      <View style={styles.noteModalActions}>
        <TouchableOpacity style={styles.noteModalBtnDanger} onPress={clearNoteFromModal}>
          <Text style={styles.btnTextDanger}>Borrar nota</Text>
        </TouchableOpacity>
        <View style={styles.noteModalActionsEnd}>
          <TouchableOpacity style={styles.noteModalBtn} onPress={dismissNoteModal}>
            <Text style={styles.btnText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.noteModalBtn} onPress={confirmNoteModal}>
            <Text style={styles.btnText}>Guardar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
    const noteBody = (
      <TextInput
        style={[styles.noteModalInput, { flex: 1, margin: 14 }]}
        value={noteDraft}
        onChangeText={setNoteDraft}
        placeholder="Escribe una nota..."
        placeholderTextColor={colors.placeholder}
        multiline
        autoFocus
      />
    );
    return (
      <PalmScreenShell title="Nota" onClose={dismissNoteModal} footer={noteFooter}>
        {Platform.OS === 'ios' ? (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
            {noteBody}
          </KeyboardAvoidingView>
        ) : (
          noteBody
        )}
      </PalmScreenShell>
    );
  }

  if (datePickerVisible) {
    return (
      <GoToDateScreen
        title="Elegir fecha"
        initialDate={dateISO || defaultDate}
        reminders={[]}
        onSelectDate={(d) => setDateISO(d)}
        onClose={() => setDatePickerVisible(false)}
      />
    );
  }

  if (reminder && detailsPalmPickerVisible) {
    return (
      <PalmScreenShell title="Hora" onClose={() => closeDetailsPalmPicker(false)}>
        <View style={{ padding: 14 }}>{renderPalmTimePickers(
          () => closeDetailsPalmPicker(true),
          () => closeDetailsPalmPicker(false)
        )}</View>
      </PalmScreenShell>
    );
  }

  if (!reminder) {
    return (
      <PalmScreenShell title="Nuevo" onClose={onClose}>
        <View style={{ padding: 14 }}>{renderPalmTimePickers(() => void handleOK(), onClose)}</View>
      </PalmScreenShell>
    );
  }

  const repeatQuickMatch = matchRepeatQuickOption(
    repeat ?? 'none',
    repeatInterval,
    repeatEndDate,
    repeatWeekdays,
    dateISO || defaultDate
  );

  const repeatDisplayLabel =
    repeat === 'none'
      ? 'No repetir'
      : buildRepeatSummary(repeat ?? 'none', repeatInterval, repeatEndDate, repeatWeekdays);

  const detailsFooter = (
    <View style={[styles.actions, { paddingHorizontal: 14, paddingVertical: 12 }]}>
      <TouchableOpacity style={styles.btn} onPress={() => void handleOK()}>
        <Text style={styles.btnText}>OK</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.btn} onPress={onClose}>
        <Text style={styles.btnText}>Cancelar</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.btn} onPress={handleDeletePress} disabled={!onDelete}>
        <Text style={[styles.btnTextDanger, !onDelete && { opacity: 0.35 }]}>Eliminar…</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.btn, { paddingHorizontal: 10, paddingVertical: 6 }]}
        onPress={openNoteModal}
        accessibilityRole="button"
        accessibilityLabel="Nota"
      >
        <Image source={notaPng} style={{ width: 20, height: 20 }} resizeMode="contain" />
      </TouchableOpacity>
    </View>
  );

  const detailsScroll = (
    <ScrollView
      ref={detailsScrollRef}
      style={styles.pdScroll}
      contentContainerStyle={styles.pdBodyPad}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      nestedScrollEnabled={false}
      onScrollBeginDrag={() => {
        setAlarmUnitPickerVisible(false);
        closeCategoryPicker();
        closeRepeatPicker();
      }}
    >
              <View style={styles.pdRow}>
                <Text style={styles.pdLabel}>Hora:</Text>
                <View style={styles.pdFieldCol}>
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={openDetailsPalmPicker}
                    accessibilityRole="button"
                    accessibilityLabel="Hora del evento"
                  >
                    <DottedRoundedOutline color={colors.textSecondary}>
                      <View style={styles.pdPickerRow}>
                        <View style={{ flex: 1 }}>
                          {!noTime && allDay ? (
                            <>
                              <Text style={styles.pdFieldText}>Todo el día</Text>
                              <Text style={[styles.pdFieldText, { fontSize: fs(11), marginTop: 4, opacity: 0.92 }]}>
                                {allDayRangeSummary}
                              </Text>
                            </>
                          ) : noTime ? (
                            <Text style={styles.pdFieldText}>Sin hora</Text>
                          ) : (
                            <Text style={styles.pdFieldText}>{editTimeSummary}</Text>
                          )}
                        </View>
                      </View>
                    </DottedRoundedOutline>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.pdRow}>
                <Text style={styles.pdLabel}>Fecha:</Text>
                <View style={styles.pdFieldCol}>
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => {
                      setAlarmUnitPickerVisible(false);
                      closeCategoryPicker();
                      closeRepeatPicker();
                      setDatePickerVisible(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Elegir fecha del evento"
                  >
                    <DottedRoundedOutline color={colors.textSecondary}>
                      <View style={styles.pdPickerRow}>
                        <Text style={styles.pdFieldTextEmphasis}>
                          {dateISO ? formatDatePalm(dateISO) : '—'}
                        </Text>
                      </View>
                    </DottedRoundedOutline>
                  </TouchableOpacity>
                </View>
              </View>

              <View
                onLayout={(e) => {
                  alarmSectionY.current = e.nativeEvent.layout.y;
                }}
              >
                <View style={[styles.pdCheckboxRow, { alignItems: 'flex-start' }]}>
                  <Text style={styles.pdLabel}>Alarma:</Text>
                  <View style={styles.alarmInlineControls}>
                    <View style={styles.alarmCheckboxWrap}>
                      <Checkbox
                        style={[styles.alarmCheckbox, noTime && { opacity: 0.45 }]}
                        value={alarm && !noTime}
                        onValueChange={(checked) => {
                          if (noTime) return;
                          if (checked) {
                            setAlarm(true);
                            const raw = alarmOffsetStr.trim();
                            if (!raw || raw === '0') setAlarmOffsetStr('5');
                          } else {
                            setAlarm(false);
                          }
                        }}
                        disabled={noTime}
                        color={colors.daySelectedBg}
                        accessibilityLabel="Activar alarma"
                      />
                    </View>
                    {alarm && !noTime ? (
                      <View style={styles.alarmFieldsRow}>
                        <View style={styles.alarmNumberCol}>
                          <View style={styles.alarmFieldContent}>
                            <TextInput
                              style={[styles.pdFieldInput, styles.alarmNumberInput, { textAlign: 'center' }]}
                              value={alarmOffsetStr}
                              onChangeText={(v) => setAlarmOffsetStr(onlyDigits(v).slice(0, 4))}
                              keyboardType="number-pad"
                              placeholder="0"
                              placeholderTextColor={colors.placeholder}
                              accessibilityLabel="Anticipación de la alarma"
                            />
                          </View>
                          {renderUnderline()}
                        </View>
                        <View style={[styles.alarmUnitCol, alarmUnitPickerVisible && { zIndex: 30 }]}>
                          <TouchableOpacity
                            style={[styles.pdFieldRow, styles.alarmUnitRow]}
                            onPress={() => {
                              closeCategoryPicker();
                              closeRepeatPicker();
                              setAlarmUnitPickerVisible((v) => !v);
                            }}
                            activeOpacity={0.75}
                            accessibilityRole="button"
                            accessibilityLabel="Unidad de la alarma"
                            accessibilityState={{ expanded: alarmUnitPickerVisible }}
                          >
                            <Text style={[styles.pdFieldText, { flex: 1 }]} numberOfLines={1}>
                              {alarmUnitLabel}
                            </Text>
                            <Text style={styles.pdFieldChevron}>▼</Text>
                          </TouchableOpacity>
                          {renderUnderline()}
                        {alarmUnitPickerVisible ? (
                          <View style={styles.alarmUnitMenu}>
                            {ALARM_UNIT_OPTIONS.map((opt, idx) => (
                              <TouchableOpacity
                                key={opt.value}
                                style={[styles.alarmUnitMenuOption, idx === 0 && { borderTopWidth: 0 }]}
                                onPress={() => {
                                  setAlarmUnit(opt.value);
                                  setAlarmUnitPickerVisible(false);
                                }}
                              >
                                <Text
                                  style={[
                                    styles.alarmUnitMenuOptionText,
                                    alarmUnit === opt.value && { color: colors.daySelectedBg },
                                  ]}
                                >
                                  {opt.label}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        ) : null}
                        </View>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>

              <View style={styles.pdRow}>
                <Text style={styles.pdLabel}>Ubicación:</Text>
                <View style={styles.pdFieldCol}>
                  <TextInput
                    style={styles.pdFieldInput}
                    value={location}
                    onChangeText={setLocation}
                    placeholderTextColor={colors.placeholder}
                    accessibilityLabel="Ubicación del evento"
                  />
                  {renderUnderline()}
                </View>
              </View>

              <View ref={categoryAnchorRef} collapsable={false} style={styles.pdRow}>
                <Text style={styles.pdLabel}>Categoría:</Text>
                <View style={styles.pdFieldCol}>
                  <TouchableOpacity
                    style={styles.pdFieldRow}
                    onPress={openCategoryPicker}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel="Categoría del evento"
                    accessibilityState={{ expanded: categoryPickerVisible }}
                  >
                    <View style={styles.categoryFieldRow}>
                      <CategoryDot color={categoryColor(category, categories)} />
                      <Text style={[styles.pdFieldText, { flex: 1 }]} numberOfLines={1}>
                        {categoryDisplayLabel(category)}
                      </Text>
                    </View>
                    <Text style={styles.pdFieldChevron}>▼</Text>
                  </TouchableOpacity>
                  {renderUnderline()}
                </View>
              </View>

              <View ref={repeatAnchorRef} collapsable={false} style={styles.pdRow}>
                <Text style={styles.pdLabel}>Repetir:</Text>
                <View style={styles.pdFieldCol}>
                  <TouchableOpacity
                    style={styles.pdFieldRow}
                    onPress={openRepeatPicker}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel="Cambiar repetición"
                    accessibilityState={{ expanded: repeatPickerVisible }}
                  >
                    <Text style={[styles.pdFieldText, { flex: 1 }]} numberOfLines={2}>
                      {repeatDisplayLabel}
                    </Text>
                    <Text style={styles.pdFieldChevron}>▼</Text>
                  </TouchableOpacity>
                  {renderUnderline()}
                </View>
              </View>

            </ScrollView>
  );

  return (
    <View style={{ flex: 1 }}>
      <PalmScreenShell title="Detalles de la cita" onClose={onClose} footer={detailsFooter}>
        <View ref={detailsCardRef} collapsable={false} style={{ flex: 1 }}>
          {Platform.OS === 'ios' ? (
            <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={Math.max(insets.top, 12)}>
              {detailsScroll}
            </KeyboardAvoidingView>
          ) : (
            detailsScroll
          )}

          {categoryPickerVisible ? (
                <View style={styles.categoryMenuOverlay} pointerEvents="box-none">
                  <TouchableOpacity
                    style={StyleSheet.absoluteFillObject}
                    activeOpacity={1}
                    onPress={closeCategoryPicker}
                  />
                  <View
                    style={[
                      styles.categoryMenu,
                      categoryMenuPos
                        ? {
                            top: categoryMenuPos.top,
                            left: categoryMenuPos.left,
                            width: categoryMenuPos.width,
                          }
                        : { top: 120, left: 112, right: 16 },
                    ]}
                  >
                    <ScrollView
                      style={styles.categoryMenuScroll}
                      nestedScrollEnabled
                      keyboardShouldPersistTaps="handled"
                      bounces={false}
                      showsVerticalScrollIndicator
                    >
                      {categories.map((cat, idx) => {
                        const isSelected = category.trim() === cat.name;
                        return (
                          <TouchableOpacity
                            key={cat.name}
                            style={[
                              styles.categoryMenuOption,
                              idx === 0 && { borderTopWidth: 0 },
                              isSelected && styles.categoryMenuOptionSelected,
                            ]}
                            onPress={() => {
                              setCategory(cat.name);
                              closeCategoryPicker();
                            }}
                          >
                            <CategoryDot color={cat.color} />
                            <Text
                              style={[
                                styles.categoryMenuOptionText,
                                isSelected && styles.categoryMenuOptionTextSelected,
                              ]}
                            >
                              {cat.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                      <TouchableOpacity
                        style={[
                          styles.categoryMenuOption,
                          styles.categoryMenuSeparator,
                          !category.trim() && styles.categoryMenuOptionSelected,
                        ]}
                        onPress={() => {
                          setCategory('');
                          closeCategoryPicker();
                        }}
                      >
                        <CategoryDot color={UNCategorized_COLOR} />
                        <Text
                          style={[
                            styles.categoryMenuOptionText,
                            !category.trim() && styles.categoryMenuOptionTextSelected,
                          ]}
                        >
                          {UNCategorized_LABEL}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.categoryMenuOption, styles.categoryMenuSeparator]}
                        onPress={() => {
                          closeCategoryPicker();
                          setEditCategoriesVisible(true);
                        }}
                      >
                        <Text style={styles.categoryMenuOptionText}>{EDIT_CATEGORIES_LABEL}</Text>
                      </TouchableOpacity>
                    </ScrollView>
                  </View>
                </View>
              ) : null}
        </View>
      </PalmScreenShell>

      {repeatPickerVisible ? (
        <ScreenOverlay zIndex={500}>
          <View style={styles.categoryMenuOverlay} pointerEvents="box-none">
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              activeOpacity={1}
              onPress={closeRepeatPicker}
            />
            <View
              style={[
                styles.floatingMenu,
                repeatMenuPos
                  ? {
                      top: repeatMenuPos.top,
                      left: repeatMenuPos.left,
                      width: repeatMenuPos.width,
                      maxHeight: repeatMenuPos.maxHeight,
                    }
                  : { top: 280, left: 112, right: 16, maxHeight: 280 },
              ]}
            >
              <ScrollView
                style={[styles.floatingMenuScroll, repeatMenuPos ? { maxHeight: repeatMenuPos.maxHeight } : { maxHeight: 280 }]}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                bounces={false}
                showsVerticalScrollIndicator
              >
                {REPEAT_QUICK_OPTIONS.map((opt, idx) => {
                  const isSelected = opt.id !== 'other' && repeatQuickMatch === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[
                        styles.categoryMenuOption,
                        idx === 0 && { borderTopWidth: 0 },
                        isSelected && styles.categoryMenuOptionSelected,
                      ]}
                      onPress={() => applyRepeatQuickOption(opt.id)}
                    >
                      <Text
                        style={[
                          styles.categoryMenuOptionText,
                          isSelected && styles.categoryMenuOptionTextSelected,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </ScreenOverlay>
      ) : null}
    </View>
  );
}
