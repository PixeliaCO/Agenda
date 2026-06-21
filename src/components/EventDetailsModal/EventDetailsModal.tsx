/**
 * Modal "Detalles del evento": horario, fecha, alarma, repetición.
 * La nota se edita en un segundo modal independiente.
 */

import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Modal,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Reminder, AlarmUnit } from '../../types/reminder';
import { usePreferences } from '../../contexts/PreferencesContext';
import { time24To12, time12To24, formatTime12h, formatTime12hCompact, formatDateFull } from '../../utils/date';
import { dayVisibleRangeToTimes } from '../../utils/scheduleHours';
import { addHour } from '../../services/reminderService';
import { scaledFontSize } from '../../utils/typography';
import { ChangeRepeatModal, buildRepeatSummary } from '../ChangeRepeatModal';
import { GoToDateModal } from '../GoToDateModal/GoToDateModal';

export type EventDetailsModalProps = {
  visible: boolean;
  /** null = crear evento nuevo */
  reminder: Reminder | null;
  /** Fecha inicial al crear (y referencia de día) */
  defaultDate: string;
  /** Al crear desde la vista semana: hora sugerida (HH:mm 24h) */
  defaultStartTime?: string;
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
      note?: string;
      allDay?: boolean;
      noTime?: boolean;
    }
  ) => void | Promise<void>;
  /** Eliminar evento (solo edición). */
  onDelete?: (id: string) => void | Promise<void>;
  onClose: () => void;
  /** Al abrir: ir a la sección de alarma o abrir el modal de nota */
  initialTarget?: 'alarm' | 'note' | null;
};

/** Aire extra entre el formulario y el teclado en el modal. */
const MODAL_KEYBOARD_EXTRA = 32;

/** Minutos en pasos de 5 (selector estilo Palm). */
const PALM_MINUTE_STEPS = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'] as const;

/** Filas visibles en cada columna hora/minuto del selector Palm. */
const PALM_PICKER_ROW_COUNT = 12;

/** En Android (HyperOS/MIUI) fade + KAV dentro de Modal transparente provoca ghosting. */
const MODAL_ANIMATION = Platform.OS === 'android' ? ('none' as const) : ('fade' as const);

type ModalOverlayProps = {
  style: object;
  /** Solo iOS: KeyboardAvoidingView con padding. Android usa resize del manifest. */
  avoidKeyboard?: boolean;
  insets: { top: number };
  children: React.ReactNode;
};

function ModalOverlay({ style, avoidKeyboard = false, insets, children }: ModalOverlayProps) {
  if (Platform.OS === 'ios' && avoidKeyboard) {
    return (
      <KeyboardAvoidingView
        behavior="padding"
        style={style}
        keyboardVerticalOffset={Math.max(insets.top, 12)}
      >
        {children}
      </KeyboardAvoidingView>
    );
  }
  return <View style={style}>{children}</View>;
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
  getDayVisibleRange,
  onSave,
  onClose,
  onDelete,
  initialTarget = null,
}: EventDetailsModalProps) {
  const insets = useSafeAreaInsets();
  const detailsScrollRef = useRef<ScrollView>(null);
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
  const [alarm, setAlarm] = useState(false);
  const [alarmOffsetStr, setAlarmOffsetStr] = useState('0');
  const [alarmUnit, setAlarmUnit] = useState<AlarmUnit>('minutes');
  const [alarmUnitPickerVisible, setAlarmUnitPickerVisible] = useState(false);
  const [repeat, setRepeat] = useState<Reminder['repeat']>('none');
  const [repeatInterval, setRepeatInterval] = useState(1);
  const [repeatEndDate, setRepeatEndDate] = useState<string | undefined>(undefined);
  const [repeatModalVisible, setRepeatModalVisible] = useState(false);
  const [note, setNote] = useState('');
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
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
      setRepeatModalVisible(false);
      setDatePickerVisible(false);
      setDetailsPalmPickerVisible(false);
    }
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
      setAlarm(reminder.noTime ? false : (reminder.alarm ?? false));
      setAlarmOffsetStr(
        reminder.alarmOffset != null && reminder.alarmOffset >= 0
          ? String(reminder.alarmOffset)
          : '0'
      );
      setAlarmUnit(reminder.alarmUnit ?? 'minutes');
      setAlarmUnitPickerVisible(false);
      setRepeat(reminder.repeat ?? 'none');
      setRepeatInterval(
        reminder.repeatInterval != null && reminder.repeatInterval >= 1 ? reminder.repeatInterval : 1
      );
      setRepeatEndDate(reminder.repeatEndDate);
      setRepeatModalVisible(false);
      setNote(reminder.note ?? '');
      setNoteModalVisible(false);
      if (initialTarget === 'note') {
        queueMicrotask(() => {
          setNoteDraft(reminder.note ?? '');
          setNoteModalVisible(true);
        });
      }
      setPalmTimeFocus('start');
      setPalmPickerPm(time24To12(reminder.noTime ? '00:00' : reminder.startTime).pm);
      setDetailsPalmPickerVisible(false);
      return;
    }
    setDateISO(defaultDate);
    setAllDay(false);
    setNoTime(false);
    setStartHour('');
    setStartMin('');
    setStartPm(false);
    setEndHour('');
    setEndMin('');
    setEndPm(false);
    setPalmPickerPm(false);
    setAlarm(false);
    setAlarmOffsetStr('5');
    setAlarmUnit('minutes');
    setRepeat('none');
    setRepeatInterval(1);
    setRepeatEndDate(undefined);
    setNote('');
    setNoteModalVisible(false);
    setPalmTimeFocus('start');
  }, [visible, reminder, defaultDate, initialTarget]);

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
      ? { repeat: 'none' as const, repeatInterval: undefined, repeatEndDate: undefined }
      : {
          repeat,
          repeatInterval: Math.max(1, repeatInterval),
          repeatEndDate: repeatEndDate?.trim() || undefined,
        };

  const performSave = async (p: {
    payloadNoTime: boolean;
    payloadAllDay: boolean;
    startTime: string;
    endTime: string;
  }) => {
    const isNewEvent = reminder === null;
    const title = isNewEvent ? '' : (reminder.title?.trim() || 'Evento');
    const repeatPayload = getRepeatPayload();
    const { payloadNoTime, payloadAllDay, startTime, endTime } = p;

    let saveAlarm = false;
    let saveAlarmOffset: number | undefined;
    let saveAlarmUnit: AlarmUnit | undefined;
    if (!payloadNoTime) {
      if (isNewEvent) {
        saveAlarm = true;
        saveAlarmOffset = 5;
        saveAlarmUnit = 'minutes';
      } else if (alarm) {
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
          backgroundColor: colors.cardBackground,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 0,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 10,
          overflow: 'hidden' as const,
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
        headerTitle: { fontSize: fs(18), color: colors.text, fontFamily: 'PixelOperator', fontWeight: 'normal' },
        sectionTitle: {
          fontSize: fs(13),
          color: colors.textSecondary,
          marginBottom: 10,
          marginTop: 4,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
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
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
          color: colors.textSecondary,
          letterSpacing: 0.4,
          textTransform: 'uppercase' as const,
          marginBottom: 10,
          paddingBottom: 8,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.line,
        },
        titleText: { fontSize: fs(16), color: colors.text, marginTop: 2, fontFamily: 'PixelOperator', fontWeight: 'normal' },
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
        checkboxRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 0 },
        checkbox: {
          width: 22,
          height: 22,
          borderWidth: 2,
          borderColor: colors.line,
          borderRadius: 0,
          marginRight: 10,
          alignItems: 'center',
          justifyContent: 'center',
        },
        checkboxChecked: { backgroundColor: colors.daySelectedBg, borderColor: colors.daySelectedBg },
        actions: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          marginTop: 20,
          paddingTop: 16,
          borderTopWidth: 1,
          borderTopColor: colors.line,
        },
        btn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 0, borderWidth: 1.5, borderColor: colors.line },
        btnPrimary: { backgroundColor: colors.daySelectedBg, borderColor: colors.daySelectedBg },
        btnText: { fontSize: fs(14), color: colors.text, fontFamily: 'PixelOperator', fontWeight: 'normal' },
        btnTextPrimary: { color: colors.onAccentBg },
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
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
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
        noteModalBtn: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 0, borderWidth: 1, borderColor: colors.line },
        noteModalBtnPrimary: { backgroundColor: colors.daySelectedBg, borderColor: colors.daySelectedBg },
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
        alarmUnitTrigger: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 0,
          paddingHorizontal: 14,
          paddingVertical: 10,
          backgroundColor: colors.cardBackground,
        },
        alarmUnitTriggerText: { fontSize: fs(15), color: colors.text, fontFamily: 'PixelOperator', fontWeight: 'normal' },
        alarmUnitChevron: { fontSize: fs(12), color: colors.textSecondary },
        unitPickerCard: {
          width: '100%' as const,
          maxWidth: 320,
          backgroundColor: colors.cardBackground,
          borderRadius: 0,
          paddingVertical: 8,
          borderWidth: 1,
          borderColor: colors.line,
        },
        unitPickerTitle: {
          fontSize: fs(15),
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
          color: colors.textSecondary,
          paddingHorizontal: 18,
          paddingVertical: 10,
        },
        unitPickerOption: {
          paddingVertical: 14,
          paddingHorizontal: 18,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.line,
        },
        unitPickerOptionText: { fontSize: fs(16), color: colors.text, fontFamily: 'PixelOperator', fontWeight: 'normal' },
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
          fontFamily: 'PixelOperator',
          fontWeight: 'normal' as const,
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
        palmBarBtn: { paddingVertical: 8, paddingHorizontal: 4 },
        palmBarOkText: {
          fontSize: fs(16),
          color: colors.daySelectedBg,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal' as const,
        },
        palmBarCancelText: {
          fontSize: fs(16),
          color: colors.textSecondary,
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
        pdScroll: { flexGrow: 1, flexShrink: 1, maxHeight: 380, backgroundColor: colors.cardBackground },
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
          width: 72,
          fontSize: fs(13),
          fontFamily: 'PixelOperator',
          fontWeight: 'normal' as const,
          color: colors.textSecondary,
          paddingTop: 6,
        },
        pdFieldBox: {
          flex: 1,
          backgroundColor: colors.fieldFill,
          borderWidth: 1,
          borderColor: colors.line,
          paddingHorizontal: 10,
          paddingVertical: 8,
          minHeight: 36,
        },
        pdFieldText: {
          fontSize: fs(14),
          fontFamily: 'PixelOperator',
          fontWeight: 'normal' as const,
          color: colors.text,
          marginBottom: 4,
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
        palmScrollItemTextActive: { color: colors.onAccentBg },
      }),
    [colors, fontScale]
  );

  const openNoteModal = () => {
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

  const toggleAlarm = () => {
    if (alarm) {
      setAlarm(false);
    } else {
      setAlarm(true);
      const raw = alarmOffsetStr.trim();
      if (!raw || raw === '0') setAlarmOffsetStr('5');
    }
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

  return (
    <>
      <Modal visible={visible} animationType={MODAL_ANIMATION} transparent>
        {reminder ? (
        <ModalOverlay avoidKeyboard style={styles.overlayCenter} insets={insets}>
          <TouchableOpacity style={styles.newEventBackdrop} activeOpacity={1} onPress={onClose} />
          <View style={styles.detailsCenterCard}>
            <ScrollView
              ref={detailsScrollRef}
              style={styles.pdScroll}
              contentContainerStyle={styles.pdBodyPad}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
              nestedScrollEnabled={false}
            >
              <View style={styles.pdRow}>
                <Text style={styles.pdLabel}>Hora:</Text>
                <View style={styles.pdFieldBox}>
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={openDetailsPalmPicker}
                    accessibilityRole="button"
                    accessibilityLabel="Hora del evento"
                  >
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
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.pdRow}>
                <Text style={styles.pdLabel}>Fecha:</Text>
                <TouchableOpacity
                  style={styles.pdFieldBox}
                  activeOpacity={0.75}
                  onPress={() => setDatePickerVisible(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Elegir fecha del evento"
                >
                  <Text style={[styles.pdFieldText, { marginBottom: 0 }]}>
                    {dateISO ? formatDateFull(dateISO) : '—'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View
                onLayout={(e) => {
                  alarmSectionY.current = e.nativeEvent.layout.y;
                }}
              >
                <View style={styles.pdCheckboxRow}>
                  <Text style={styles.pdLabel}>Alarma:</Text>
                  <TouchableOpacity
                    style={[styles.checkbox, alarm && !noTime && styles.checkboxChecked, noTime && { opacity: 0.45 }]}
                    onPress={() => {
                      if (!noTime) toggleAlarm();
                    }}
                    disabled={noTime}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: alarm && !noTime, disabled: noTime }}
                  >
                    {alarm && !noTime ? (
                      <Text style={{ color: colors.onAccentBg, fontSize: fs(13) }}>✓</Text>
                    ) : null}
                  </TouchableOpacity>
                </View>
                {alarm && !noTime ? (
                  <View style={{ marginLeft: 72, marginBottom: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <TextInput
                      style={styles.alarmOffsetInput}
                      value={alarmOffsetStr}
                      onChangeText={(v) => setAlarmOffsetStr(onlyDigits(v).slice(0, 4))}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={colors.placeholder}
                      accessibilityLabel="Anticipación de la alarma"
                    />
                    <TouchableOpacity
                      style={styles.alarmUnitTrigger}
                      onPress={() => setAlarmUnitPickerVisible(true)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.alarmUnitTriggerText}>{alarmUnitLabel}</Text>
                      <Text style={styles.alarmUnitChevron}>▼</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>

              <View style={styles.pdRow}>
                <Text style={styles.pdLabel}>Repetir:</Text>
                <TouchableOpacity
                  style={styles.pdFieldBox}
                  onPress={() => setRepeatModalVisible(true)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel="Cambiar repetición"
                >
                  <Text style={styles.pdFieldText}>
                    {repeat === 'none' ? 'No' : buildRepeatSummary(repeat ?? 'none', repeatInterval, repeatEndDate)}
                  </Text>
                </TouchableOpacity>
              </View>

            </ScrollView>

            <View style={[styles.actions, { marginTop: 4, paddingTop: 12 }]}>
              <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => void handleOK()}>
                <Text style={[styles.btnText, styles.btnTextPrimary]}>OK</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btn} onPress={onClose}>
                <Text style={styles.btnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btn}
                onPress={handleDeletePress}
                disabled={!onDelete}
              >
                <Text style={[styles.btnTextDanger, !onDelete && { opacity: 0.35 }]}>Eliminar…</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btn} onPress={openNoteModal}>
                <Text style={styles.btnText}>Nota</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ModalOverlay>
        ) : (
        <ModalOverlay style={styles.overlayCenter} insets={insets}>
          <TouchableOpacity style={styles.newEventBackdrop} activeOpacity={1} onPress={onClose} />
          <View style={styles.newEventCard}>
                <View style={[styles.header, { marginBottom: 12 }]}>
                  <Text style={styles.headerTitle}>Nuevo</Text>
                </View>
                {renderPalmTimePickers(() => void handleOK(), onClose)}
          </View>
        </ModalOverlay>
        )}
      </Modal>

      <Modal
        visible={reminder != null && detailsPalmPickerVisible}
        animationType={MODAL_ANIMATION}
        transparent
        onRequestClose={() => closeDetailsPalmPicker(false)}
      >
        <ModalOverlay style={styles.overlayCenter} insets={insets}>
          <TouchableOpacity
            style={styles.newEventBackdrop}
            activeOpacity={1}
            onPress={() => closeDetailsPalmPicker(false)}
          />
          <View style={styles.newEventCard}>
            <View style={[styles.header, { marginBottom: 12 }]}>
              <Text style={styles.headerTitle}>Hora</Text>
            </View>
            {renderPalmTimePickers(
              () => closeDetailsPalmPicker(true),
              () => closeDetailsPalmPicker(false)
            )}
          </View>
        </ModalOverlay>
      </Modal>

      <Modal visible={noteModalVisible} animationType={MODAL_ANIMATION} transparent onRequestClose={dismissNoteModal}>
        <View style={styles.noteModalRoot}>
          <TouchableOpacity style={styles.noteModalBackdrop} activeOpacity={1} onPress={dismissNoteModal} />
          <ModalOverlay avoidKeyboard style={styles.noteModalCenter} insets={insets}>
            <View style={styles.noteModalCard}>
              <Text style={styles.noteModalTitle}>Nota</Text>
              <TextInput
                style={styles.noteModalInput}
                value={noteDraft}
                onChangeText={setNoteDraft}
                placeholder="Escribe una nota..."
                placeholderTextColor={colors.placeholder}
                multiline
                autoFocus
              />
              <View style={styles.noteModalActions}>
                <TouchableOpacity style={styles.noteModalBtnDanger} onPress={clearNoteFromModal}>
                  <Text style={styles.btnTextDanger}>Borrar nota</Text>
                </TouchableOpacity>
                <View style={styles.noteModalActionsEnd}>
                  <TouchableOpacity style={styles.noteModalBtn} onPress={dismissNoteModal}>
                    <Text style={styles.btnText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.noteModalBtn, styles.noteModalBtnPrimary]} onPress={confirmNoteModal}>
                    <Text style={[styles.btnText, styles.btnTextPrimary]}>Guardar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </ModalOverlay>
        </View>
      </Modal>

      <Modal
        visible={alarmUnitPickerVisible}
        animationType={MODAL_ANIMATION}
        transparent
        onRequestClose={() => setAlarmUnitPickerVisible(false)}
      >
        <View style={styles.noteModalRoot}>
          <TouchableOpacity
            style={styles.noteModalBackdrop}
            activeOpacity={1}
            onPress={() => setAlarmUnitPickerVisible(false)}
          />
          <View style={styles.noteModalCenter}>
            <View style={styles.unitPickerCard}>
              <Text style={styles.unitPickerTitle}>Unidad</Text>
              {ALARM_UNIT_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={styles.unitPickerOption}
                  onPress={() => {
                    setAlarmUnit(opt.value);
                    setAlarmUnitPickerVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.unitPickerOptionText,
                      alarmUnit === opt.value && { color: colors.daySelectedBg },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      <GoToDateModal
        visible={datePickerVisible}
        title="Elegir fecha"
        initialDate={dateISO || defaultDate}
        reminders={[]}
        onSelectDate={(d) => setDateISO(d)}
        onClose={() => setDatePickerVisible(false)}
      />

      <ChangeRepeatModal
        visible={repeatModalVisible}
        frequency={repeat ?? 'none'}
        interval={repeatInterval}
        endDateISO={repeatEndDate}
        onApply={(f, int, end) => {
          setRepeat(f);
          setRepeatInterval(int);
          setRepeatEndDate(end);
          setRepeatModalVisible(false);
        }}
        onDismiss={() => setRepeatModalVisible(false)}
      />
    </>
  );
}
