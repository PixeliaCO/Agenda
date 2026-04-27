/**
 * Modal "Detalles del evento": horario, fecha, alarma, repetición.
 * La nota se edita en un segundo modal independiente.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Reminder, AlarmUnit } from '../../types/reminder';
import { usePreferences } from '../../contexts/PreferencesContext';
import { time24To12, time12To24, formatDateFull, formatTime12h } from '../../utils/date';
import { dayVisibleRangeToTimes } from '../../utils/scheduleHours';
import { addHour } from '../../services/reminderService';
import { scaledFontSize } from '../../utils/typography';
import { ChangeRepeatModal, buildRepeatSummary } from '../ChangeRepeatModal';

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
  /** id null → crear; con id → actualizar */
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
  ) => void;
  onClose: () => void;
  /** Al abrir: ir a la sección de alarma o abrir el modal de nota */
  initialTarget?: 'alarm' | 'note' | null;
};

/** Aire extra entre el formulario y el teclado en el modal. */
const MODAL_KEYBOARD_EXTRA = 32;

const ALARM_UNIT_OPTIONS: { value: AlarmUnit; label: string }[] = [
  { value: 'minutes', label: 'Minutos' },
  { value: 'hours', label: 'Horas' },
  { value: 'days', label: 'Días' },
];

export function EventDetailsModal({
  visible,
  reminder,
  defaultDate,
  defaultStartTime,
  getDayVisibleRange,
  onSave,
  onClose,
  initialTarget = null,
}: EventDetailsModalProps) {
  const insets = useSafeAreaInsets();
  const detailsScrollRef = useRef<ScrollView>(null);
  const alarmSectionY = useRef(0);
  const [keyboardPad, setKeyboardPad] = useState(0);
  const [titleDraft, setTitleDraft] = useState('');
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

  const { colors, fontScale } = usePreferences();
  const fs = (n: number) => scaledFontSize(n, fontScale);

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
      return;
    }
    if (reminder) {
      setTitleDraft(reminder.title ?? '');
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
      return;
    }
    setTitleDraft('');
    setDateISO(defaultDate);
    setAllDay(false);
    setNoTime(false);
    const base = defaultStartTime?.trim() || '09:00';
    const s = time24To12(base);
    setStartHour(String(s.hour));
    setStartMin(String(s.min).padStart(2, '0'));
    setStartPm(s.pm);
    const e = time24To12(addHour(base));
    setEndHour(String(e.hour));
    setEndMin(String(e.min).padStart(2, '0'));
    setEndPm(e.pm);
    setAlarm(true);
    setAlarmOffsetStr('5');
    setAlarmUnit('minutes');
    setRepeat('none');
    setRepeatInterval(1);
    setRepeatEndDate(undefined);
    setNote('');
    setNoteModalVisible(false);
    if (initialTarget === 'note') {
      queueMicrotask(() => {
        setNoteDraft('');
        setNoteModalVisible(true);
      });
    }
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

  const handleOK = () => {
    const title = titleDraft.trim() || 'Evento';
    const repeatPayload =
      repeat === 'none'
        ? { repeat: 'none' as const, repeatInterval: undefined, repeatEndDate: undefined }
        : {
            repeat,
            repeatInterval: Math.max(1, repeatInterval),
            repeatEndDate: repeatEndDate?.trim() || undefined,
          };

    let startTime = '09:00';
    let endTime = '10:00';
    let payloadAllDay = false;
    let payloadNoTime = false;

    if (noTime) {
      startTime = '00:00';
      endTime = '00:00';
      payloadNoTime = true;
    } else if (allDay) {
      const { startHour: sh, endHour: eh } = getDayVisibleRange(dateISO);
      const range = dayVisibleRangeToTimes(sh, eh);
      startTime = range.startTime;
      endTime = range.endTime;
      payloadAllDay = true;
    } else {
      const sh = parseHour(startHour);
      const sm = parseMin(startMin);
      const eh = parseHour(endHour);
      const em = parseMin(endMin);
      if (sh === null || sm === null || eh === null || em === null) {
        Alert.alert('Horario requerido', 'Revisa hora de inicio y fin.');
        return;
      }
      startTime = time12To24(sh, sm, startPm);
      endTime = time12To24(eh, em, endPm);
    }

    const useAlarm = !noTime && alarm;
    if (useAlarm) {
      const offset = parseInt(alarmOffsetStr.trim(), 10);
      if (!Number.isFinite(offset) || offset < 1) {
        Alert.alert('Alarma', 'Indica un anticipo mayor que cero (número entero).');
        return;
      }
      if (offset > 9999) {
        Alert.alert('Alarma', 'El valor es demasiado grande.');
        return;
      }
      onSave(reminder?.id ?? null, {
        title,
        startTime,
        endTime,
        date: dateISO,
        alarm: true,
        alarmOffset: offset,
        alarmUnit,
        allDay: payloadAllDay,
        noTime: payloadNoTime,
        ...repeatPayload,
        note: note.trim() || undefined,
      });
    } else {
      onSave(reminder?.id ?? null, {
        title,
        startTime,
        endTime,
        date: dateISO,
        alarm: false,
        alarmOffset: undefined,
        alarmUnit: undefined,
        allDay: payloadAllDay,
        noTime: payloadNoTime,
        ...repeatPayload,
        note: note.trim() || undefined,
      });
    }
    onClose();
  };

  const onlyDigits = (v: string) => v.replace(/[^0-9]/g, '');

  const styles = useMemo(
    () =>
      StyleSheet.create({
        baseText: { fontFamily: 'PixelOperator', fontWeight: 'normal' as const },
        overlay: { flex: 1, justifyContent: 'flex-end' },
        backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.backdrop },
        box: {
          backgroundColor: colors.cardBackground,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 28,
          maxHeight: '88%',
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
    if (allDay) {
      setAllDay(false);
    } else {
      setNoTime(false);
      setAllDay(true);
    }
  };

  const toggleNoTime = () => {
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

  if (!visible) return null;

  const showTimePickers = !noTime && !allDay;

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.overlay}
          keyboardVerticalOffset={Platform.OS === 'ios' ? Math.max(insets.top, 12) : 0}
        >
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
          <View style={styles.box}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{reminder ? 'Detalles del evento' : 'Nuevo evento'}</Text>
          </View>
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitleBordered}>Título</Text>
            <TextInput
              style={[styles.titleText, styles.titleInput]}
              value={titleDraft}
              onChangeText={setTitleDraft}
              placeholder="Título del evento"
              placeholderTextColor={colors.placeholder}
              accessibilityLabel="Título del evento"
            />
          </View>
          <ScrollView
            ref={detailsScrollRef}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
            style={{ maxHeight: 400 }}
            contentContainerStyle={{
              paddingBottom:
                12 +
                insets.bottom +
                (keyboardPad > 0 ? MODAL_KEYBOARD_EXTRA : 0) +
                (Platform.OS === 'android' ? keyboardPad : Math.round(keyboardPad * 0.52)),
            }}
          >
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitleBordered}>Horario del evento</Text>
              <View style={styles.checkboxRow}>
                <TouchableOpacity
                  style={[styles.checkbox, allDay && styles.checkboxChecked]}
                  onPress={toggleAllDay}
                >
                  {allDay && <Text style={{ color: colors.onAccentBg, fontSize: fs(14) }}>✓</Text>}
                </TouchableOpacity>
                <Text style={styles.label}>Todo el día</Text>
              </View>
              <View style={[styles.checkboxRow, { marginTop: 8 }]}>
                <TouchableOpacity
                  style={[styles.checkbox, noTime && styles.checkboxChecked]}
                  onPress={toggleNoTime}
                >
                  {noTime && <Text style={{ color: colors.onAccentBg, fontSize: fs(14) }}>✓</Text>}
                </TouchableOpacity>
                <Text style={styles.label}>Sin tiempo</Text>
              </View>
              <View style={styles.timeGroup}>
              {noTime ? (
                <Text style={styles.timeRangeText}>Sin hora (recordatorio en la parte superior del día)</Text>
              ) : allDay ? (
                <Text style={styles.timeRangeText}>Todo el día: {allDayRangeSummary}</Text>
              ) : (
              <Text style={styles.timeRangeText}>
                De {[startHour || '00', (startMin || '00').padStart(2, '0')].join('-')} {startPm ? 'p. m.' : 'a. m.'} a {[endHour || '00', (endMin || '00').padStart(2, '0')].join('-')} {endPm ? 'p. m.' : 'a. m.'}
              </Text>
              )}
              {showTimePickers ? (
                <>
                  <View style={styles.timeRow}>
                    <Text style={styles.timeRowLabel}>Inicio</Text>
                    <View style={styles.timeInputsRow}>
                      <View style={styles.timeGroupInline}>
                        <TextInput
                          style={styles.timeInputSmall}
                          value={startHour}
                          onChangeText={(v) => setStartHour(onlyDigits(v).slice(0, 2))}
                          keyboardType="number-pad"
                          placeholder="00"
                          placeholderTextColor={colors.placeholder}
                        />
                        <Text style={styles.timeColon}>-</Text>
                        <TextInput
                          style={styles.timeInputSmall}
                          value={startMin}
                          onChangeText={(v) => setStartMin(onlyDigits(v).slice(0, 2))}
                          keyboardType="number-pad"
                          placeholder="00"
                          placeholderTextColor={colors.placeholder}
                        />
                      </View>
                      <TouchableOpacity style={[styles.ampmBtn, !startPm && styles.ampmBtnActive]} onPress={() => setStartPm(false)}>
                        <Text style={[styles.ampmText, !startPm && styles.ampmTextActive]}>a. m.</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.ampmBtn, startPm && styles.ampmBtnActive]} onPress={() => setStartPm(true)}>
                        <Text style={[styles.ampmText, startPm && styles.ampmTextActive]}>p. m.</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.timeRow}>
                    <Text style={styles.timeRowLabel}>Fin</Text>
                    <View style={styles.timeInputsRow}>
                      <View style={styles.timeGroupInline}>
                        <TextInput
                          style={styles.timeInputSmall}
                          value={endHour}
                          onChangeText={(v) => setEndHour(onlyDigits(v).slice(0, 2))}
                          keyboardType="number-pad"
                          placeholder="00"
                          placeholderTextColor={colors.placeholder}
                        />
                        <Text style={styles.timeColon}>-</Text>
                        <TextInput
                          style={styles.timeInputSmall}
                          value={endMin}
                          onChangeText={(v) => setEndMin(onlyDigits(v).slice(0, 2))}
                          keyboardType="number-pad"
                          placeholder="00"
                          placeholderTextColor={colors.placeholder}
                        />
                      </View>
                      <TouchableOpacity style={[styles.ampmBtn, !endPm && styles.ampmBtnActive]} onPress={() => setEndPm(false)}>
                        <Text style={[styles.ampmText, !endPm && styles.ampmTextActive]}>a. m.</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.ampmBtn, endPm && styles.ampmBtnActive]} onPress={() => setEndPm(true)}>
                        <Text style={[styles.ampmText, endPm && styles.ampmTextActive]}>p. m.</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              ) : null}
            </View>
            </View>

            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitleBordered}>Fecha</Text>
              <View style={[styles.row, { marginBottom: 0 }]}>
                <Text style={styles.dateInfo}>{dateISO ? formatDateFull(dateISO) : '—'}</Text>
              </View>
            </View>

            <View
              onLayout={(e) => {
                alarmSectionY.current = e.nativeEvent.layout.y;
              }}
            >
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionTitleBordered}>Alarma</Text>
                {noTime ? (
                  <Text style={[styles.label, { marginBottom: 4 }]}>No disponible sin hora.</Text>
                ) : null}
                <View style={styles.checkboxRow}>
                  <TouchableOpacity
                    style={[styles.checkbox, alarm && styles.checkboxChecked, noTime && { opacity: 0.4 }]}
                    onPress={() => {
                      if (!noTime) toggleAlarm();
                    }}
                    disabled={noTime}
                  >
                    {alarm && <Text style={{ color: colors.onAccentBg, fontSize: fs(14) }}>✓</Text>}
                  </TouchableOpacity>
                  <Text style={[styles.label, noTime && { opacity: 0.5 }]}>Activar alarma</Text>
                </View>
                {alarm && !noTime ? (
                  <View style={styles.alarmOptionsBlock}>
                    <Text style={styles.alarmAnticipationLabel}>Anticipación (antes del inicio)</Text>
                    <View style={styles.alarmAnticipationRow}>
                      <TextInput
                        style={styles.alarmOffsetInput}
                        value={alarmOffsetStr}
                        onChangeText={(v) => setAlarmOffsetStr(onlyDigits(v).slice(0, 4))}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={colors.placeholder}
                        accessibilityLabel="Cantidad de tiempo antes del evento"
                      />
                      <TouchableOpacity
                        style={styles.alarmUnitTrigger}
                        onPress={() => setAlarmUnitPickerVisible(true)}
                        accessibilityRole="button"
                        accessibilityLabel="Unidad de tiempo: minutos, horas o días"
                      >
                        <Text style={styles.alarmUnitTriggerText}>{alarmUnitLabel}</Text>
                        <Text style={styles.alarmUnitChevron}>▼</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={[styles.sectionBlock, { marginBottom: 4 }]}>
              <Text style={styles.sectionTitleBordered}>Repetir</Text>
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => setRepeatModalVisible(true)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Cambiar repetición"
              >
                <Text
                  style={[styles.dateInfo, { flex: 1 }, repeat === 'none' && { color: colors.textSecondary }]}
                  numberOfLines={2}
                >
                  {repeat === 'none' ? 'No' : buildRepeatSummary(repeat ?? 'none', repeatInterval, repeatEndDate)}
                </Text>
                <Text style={{ fontSize: fs(18), color: colors.textSecondary, fontWeight: '600' }}>›</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={handleOK}>
              <Text style={[styles.btnText, styles.btnTextPrimary]}>OK</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btn} onPress={onClose}>
              <Text style={styles.btnText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btn} onPress={openNoteModal}>
              <Text style={styles.btnText}>Nota</Text>
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={noteModalVisible} animationType="fade" transparent onRequestClose={dismissNoteModal}>
        <View style={styles.noteModalRoot}>
          <TouchableOpacity style={styles.noteModalBackdrop} activeOpacity={1} onPress={dismissNoteModal} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? Math.max(insets.top, 12) : 0}
            style={styles.noteModalCenter}
          >
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
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        visible={alarmUnitPickerVisible}
        animationType="fade"
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
