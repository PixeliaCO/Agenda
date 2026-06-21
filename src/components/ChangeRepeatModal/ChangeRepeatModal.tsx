/**
 * Modal de repetición — mismo aspecto que «Detalles de la cita».
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Keyboard,
} from 'react-native';
import type { Reminder } from '../../types/reminder';
import { formatDisplayDate, getDayIndexFromDate, getTodayISO } from '../../utils/date';
import { usePreferences } from '../../contexts/PreferencesContext';
import { scaledFontSize } from '../../utils/typography';
import { GoToDateScreen } from '../GoToDateModal/GoToDateModal';
import { PalmScreenShell, ScreenOverlay } from '../PalmScreenShell';

const UNDERLINE_DOTS = Array.from({ length: 60 });

export type RepeatFrequency = NonNullable<Reminder['repeat']>;

type ChangeRepeatScreenProps = {
  frequency: RepeatFrequency;
  interval: number;
  endDateISO?: string;
  weekdays?: number[];
  eventDateISO?: string;
  onApply: (
    frequency: RepeatFrequency,
    interval: number,
    endDateISO?: string,
    weekdays?: number[]
  ) => void;
  onDismiss: () => void;
};

const FREQ_TABS: { value: RepeatFrequency; label: string }[] = [
  { value: 'none', label: 'Ninguna' },
  { value: 'daily', label: 'Día' },
  { value: 'weekly', label: 'Semana' },
  { value: 'monthly', label: 'Mes' },
  { value: 'yearly', label: 'Año' },
];

const WEEKDAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const;
const WEEKDAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;
const WEEKDAY_LONG = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;

function unitLabel(freq: RepeatFrequency): string {
  switch (freq) {
    case 'daily':
      return 'día(s)';
    case 'weekly':
      return 'semana(s)';
    case 'monthly':
      return 'mes(es)';
    case 'yearly':
      return 'año(s)';
    default:
      return '';
  }
}

function formatWeekdayList(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  const names = sorted.map((d) => WEEKDAY_SHORT[d] ?? '?');
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

function weeklyCore(interval: number, weekdays?: number[]): string {
  const n = Math.max(1, interval);
  const days = weekdays?.length ? [...weekdays].sort((a, b) => a - b) : undefined;

  if (!days?.length) {
    return n === 1 ? 'Cada semana' : `Cada ${n} semanas`;
  }

  if (n === 1 && days.length === 1) {
    return `Cada ${WEEKDAY_LONG[days[0]]} de la semana`;
  }

  const dayPart = formatWeekdayList(days);
  if (n === 1) return `Cada ${dayPart}`;
  return `Cada ${n} semanas · ${dayPart}`;
}

export function buildRepeatSummary(
  frequency: RepeatFrequency,
  interval: number,
  endDateISO?: string,
  weekdays?: number[]
): string {
  if (frequency === 'none') return 'No repetir';

  const n = Math.max(1, interval);
  let core = '';
  switch (frequency) {
    case 'daily':
      core = n === 1 ? 'Cada día' : `Cada ${n} días`;
      break;
    case 'weekly':
      core = weeklyCore(n, weekdays);
      break;
    case 'monthly':
      core = n === 1 ? 'Cada mes' : `Cada ${n} meses`;
      break;
    case 'yearly':
      core = n === 1 ? 'Cada año' : `Cada ${n} años`;
      break;
    default:
      core = '';
  }
  if (endDateISO && /^\d{4}-\d{2}-\d{2}$/.test(endDateISO)) {
    return `${core} · hasta ${formatDisplayDate(endDateISO)}`;
  }
  return core;
}

function defaultEventWeekday(eventDateISO?: string): number {
  if (eventDateISO && /^\d{4}-\d{2}-\d{2}$/.test(eventDateISO)) {
    return getDayIndexFromDate(eventDateISO);
  }
  return getDayIndexFromDate(getTodayISO());
}

export const REPEAT_QUICK_OPTIONS = [
  { id: 'none', label: 'No repetir' },
  { id: 'daily_until', label: 'Diario hasta…' },
  { id: 'weekly', label: 'Cada semana' },
  { id: 'biweekly', label: 'Cada dos semanas' },
  { id: 'monthly', label: 'Cada mes' },
  { id: 'yearly', label: 'Cada año' },
  { id: 'other', label: 'Otro…' },
] as const;

export type RepeatQuickOptionId = (typeof REPEAT_QUICK_OPTIONS)[number]['id'];

/** Preset Palm del desplegable «Repetir»; `custom` si no coincide con ninguno. */
export function matchRepeatQuickOption(
  frequency: RepeatFrequency,
  interval: number,
  endDateISO?: string,
  weekdays?: number[],
  eventDateISO?: string
): RepeatQuickOptionId | 'custom' {
  if (frequency === 'none') return 'none';

  const eventWeekday = defaultEventWeekday(eventDateISO);
  const n = Math.max(1, interval);
  const endOk = Boolean(endDateISO && /^\d{4}-\d{2}-\d{2}$/.test(endDateISO));
  const days = weekdays?.length ? [...weekdays].sort((a, b) => a - b) : [eventWeekday];
  const singleEventDay = days.length === 1 && days[0] === eventWeekday;

  if (frequency === 'daily' && n === 1 && endOk) return 'daily_until';
  if (frequency === 'weekly' && n === 1 && singleEventDay) return 'weekly';
  if (frequency === 'weekly' && n === 2 && singleEventDay) return 'biweekly';
  if (frequency === 'monthly' && n === 1) return 'monthly';
  if (frequency === 'yearly' && n === 1) return 'yearly';
  return 'custom';
}

export function ChangeRepeatScreen({
  frequency,
  interval,
  endDateISO,
  weekdays,
  eventDateISO,
  onApply,
  onDismiss,
}: ChangeRepeatScreenProps) {
  const { colors, fontScale } = usePreferences();
  const [keyboardPad, setKeyboardPad] = useState(0);
  const [freq, setFreq] = useState<RepeatFrequency>(frequency);
  const [everyStr, setEveryStr] = useState(String(interval));
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endDateStr, setEndDateStr] = useState('');
  const [endMenuVisible, setEndMenuVisible] = useState(false);
  const [endDatePickerVisible, setEndDatePickerVisible] = useState(false);
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([]);

  const eventWeekday = useMemo(() => defaultEventWeekday(eventDateISO), [eventDateISO]);

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
    setFreq(frequency);
    setEveryStr(String(Math.max(1, interval)));
    const end = endDateISO && /^\d{4}-\d{2}-\d{2}$/.test(endDateISO) ? endDateISO : '';
    setHasEndDate(!!end);
    setEndDateStr(end);
    setEndMenuVisible(false);
    if (weekdays?.length) {
      setSelectedWeekdays([...weekdays].sort((a, b) => a - b));
    } else if (frequency === 'weekly') {
      setSelectedWeekdays([eventWeekday]);
    } else {
      setSelectedWeekdays([]);
    }
  }, [frequency, interval, endDateISO, weekdays, eventWeekday]);

  const summary = useMemo(
    () =>
      buildRepeatSummary(
        freq,
        parseInt(everyStr, 10) || 1,
        hasEndDate ? endDateStr : undefined,
        freq === 'weekly' ? selectedWeekdays : undefined
      ),
    [freq, everyStr, hasEndDate, endDateStr, selectedWeekdays]
  );

  const onlyDigits = (v: string) => v.replace(/[^0-9]/g, '');
  const endDateValid = /^\d{4}-\d{2}-\d{2}$/.test(endDateStr.trim());

  const handleFreqChange = useCallback(
    (newFreq: RepeatFrequency) => {
      setFreq(newFreq);
      if (newFreq === 'weekly' && selectedWeekdays.length === 0) {
        setSelectedWeekdays([eventWeekday]);
      }
    },
    [eventWeekday, selectedWeekdays.length]
  );

  const toggleWeekday = (dayIndex: number) => {
    setSelectedWeekdays((prev) => {
      if (prev.includes(dayIndex)) {
        return prev.length > 1 ? prev.filter((d) => d !== dayIndex) : prev;
      }
      return [...prev, dayIndex].sort((a, b) => a - b);
    });
  };

  const handleOK = () => {
    if (freq === 'none') {
      onApply('none', 1, undefined, undefined);
      return;
    }
    const n = parseInt(everyStr.trim(), 10);
    if (!Number.isFinite(n) || n < 1) {
      Alert.alert('Repetición', 'Indica un número mayor que cero en «Cada».');
      return;
    }
    if (n > 999) {
      Alert.alert('Repetición', 'El intervalo es demasiado grande.');
      return;
    }
    if (freq === 'weekly' && selectedWeekdays.length === 0) {
      Alert.alert('Repetición', 'Elige al menos un día de la semana.');
      return;
    }
    if (hasEndDate) {
      if (!endDateValid) {
        Alert.alert('Repetición', 'Elige una fecha límite en el calendario.');
        return;
      }
      onApply(freq, n, endDateStr.trim(), freq === 'weekly' ? selectedWeekdays : undefined);
    } else {
      onApply(freq, n, undefined, freq === 'weekly' ? selectedWeekdays : undefined);
    }
  };

  const endMenuLabel = hasEndDate ? 'Seleccionar fecha fin' : 'Sin fecha final';

  const styles = useMemo(() => {
    const fs = (n: number) => scaledFontSize(n, fontScale);
    return StyleSheet.create({
      bodyPad: { padding: 14, paddingBottom: 8 },
      tabRow: {
        flexDirection: 'row',
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#000000',
      },
      tab: {
        flex: 1,
        paddingVertical: 7,
        paddingHorizontal: 2,
        alignItems: 'center',
        justifyContent: 'center',
        borderRightWidth: 1,
        borderRightColor: '#000000',
      },
      tabLast: { borderRightWidth: 0 },
      tabIdle: { backgroundColor: '#ffffff' },
      tabActive: { backgroundColor: colors.agendaHeaderSelectedBg },
      tabText: {
        color: '#000000',
        fontSize: fs(11),
        fontFamily: 'PixelOperator',
        fontWeight: 'normal',
        textAlign: 'center',
      },
      tabTextActive: { color: colors.onAccentBg },
      hintText: {
        color: colors.textSecondary,
        fontSize: fs(13),
        lineHeight: Math.round(fs(13) * 1.4),
        textAlign: 'center',
        marginBottom: 12,
        paddingHorizontal: 8,
        fontFamily: 'PixelOperator',
        fontWeight: 'normal',
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
      pdFieldCol: { flex: 1 },
      pdFieldRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        minHeight: 28,
        paddingHorizontal: 2,
        paddingVertical: 4,
        backgroundColor: '#ffffff',
      },
      pdFieldChevron: { fontSize: fs(11), color: colors.textSecondary, marginLeft: 8 },
      fieldUnderline: { flexDirection: 'row' as const, overflow: 'hidden' as const, height: 2 },
      fieldUnderlineDot: { width: 2, height: 2, marginRight: 3, backgroundColor: colors.textSecondary },
      pdFieldText: {
        fontSize: fs(14),
        fontFamily: 'PixelOperator',
        fontWeight: 'normal' as const,
        color: colors.text,
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
      everyFieldsRow: { flex: 1, flexDirection: 'row' as const, gap: 8, alignItems: 'flex-end' as const },
      everyNumberCol: { width: 44 },
      everyUnitCol: { flex: 1, minWidth: 96 },
      everyFieldContent: {
        height: 28,
        justifyContent: 'center' as const,
        paddingHorizontal: 2,
        backgroundColor: '#ffffff',
      },
      everyNumberInput: {
        height: 28,
        minHeight: 28,
        paddingVertical: 0,
        paddingTop: 0,
        paddingBottom: 0,
        textAlign: 'center' as const,
        textAlignVertical: 'center' as const,
        ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
      },
      everyUnitRow: { height: 28, minHeight: 28, paddingVertical: 0 },
      weekdayRow: { flexDirection: 'row', gap: 4, paddingVertical: 2 },
      weekdayBtn: {
        flex: 1,
        aspectRatio: 1,
        maxWidth: 34,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.fieldFill,
      },
      weekdayBtnActive: {
        backgroundColor: colors.agendaHeaderSelectedBg,
        borderColor: colors.agendaHeaderSelectedBg,
      },
      weekdayBtnText: {
        color: colors.text,
        fontSize: fs(12),
        fontFamily: 'PixelOperator',
        fontWeight: 'normal',
      },
      weekdayBtnTextActive: { color: colors.onAccentBg },
      summaryBox: {
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.fieldFill,
        padding: 10,
        minHeight: 48,
        marginBottom: 8,
      },
      summaryText: {
        color: colors.text,
        fontSize: fs(14),
        lineHeight: Math.round(fs(14) * 1.35),
        fontFamily: 'PixelOperator',
        fontWeight: 'normal',
      },
      actions: {
        flexDirection: 'row',
        flexWrap: 'nowrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 12,
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
      endMenuOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
        zIndex: 50,
      },
      subModalCard: {
        backgroundColor: '#ffffff',
        borderRadius: 0,
        borderWidth: 1,
        borderColor: colors.line,
        paddingVertical: 4,
        minWidth: 240,
        zIndex: 2,
        elevation: 6,
      },
      subModalOpt: { paddingVertical: 12, paddingHorizontal: 16 },
      subModalOptText: { color: colors.text, fontSize: fs(15), fontFamily: 'PixelOperator', fontWeight: 'normal' },
    });
  }, [colors, fontScale]);

  const renderUnderline = () => (
    <View style={styles.fieldUnderline} pointerEvents="none">
      {UNDERLINE_DOTS.map((_, i) => (
        <View key={i} style={styles.fieldUnderlineDot} />
      ))}
    </View>
  );

  const footer = (
    <View style={[styles.actions, Platform.OS === 'android' && keyboardPad > 0 && { marginBottom: keyboardPad }]}>
      <TouchableOpacity style={styles.btn} onPress={handleOK}>
        <Text style={styles.btnText}>OK</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.btn} onPress={onDismiss}>
        <Text style={styles.btnText}>Cancelar</Text>
      </TouchableOpacity>
    </View>
  );

  const scrollBody = (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.bodyPad, { paddingBottom: keyboardPad + 8 }]}
    >
          <View style={styles.tabRow}>
            {FREQ_TABS.map((t, i) => (
              <TouchableOpacity
                key={t.value}
                style={[
                  styles.tab,
                  i === FREQ_TABS.length - 1 && styles.tabLast,
                  freq === t.value ? styles.tabActive : styles.tabIdle,
                ]}
                onPress={() => handleFreqChange(t.value)}
              >
                <Text style={[styles.tabText, freq === t.value && styles.tabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {freq === 'none' ? (
            <Text style={styles.hintText}>
              Toque en uno de los botones superiores para establecer un intervalo de repetición.
            </Text>
          ) : (
            <>
              <View style={styles.pdRow}>
                <Text style={styles.pdLabel}>Cada:</Text>
                <View style={styles.everyFieldsRow}>
                  <View style={styles.everyNumberCol}>
                    <View style={styles.everyFieldContent}>
                      <TextInput
                        style={[styles.pdFieldInput, styles.everyNumberInput]}
                        value={everyStr}
                        onChangeText={(v) => setEveryStr(onlyDigits(v).slice(0, 3))}
                        keyboardType="number-pad"
                        accessibilityLabel="Intervalo de repetición"
                      />
                    </View>
                    {renderUnderline()}
                  </View>
                  <View style={styles.everyUnitCol}>
                    <View style={[styles.pdFieldRow, styles.everyUnitRow]}>
                      <Text style={[styles.pdFieldText, { flex: 1 }]} numberOfLines={1}>
                        {unitLabel(freq)}
                      </Text>
                    </View>
                    {renderUnderline()}
                  </View>
                </View>
              </View>

              <View style={styles.pdRow}>
                <Text style={styles.pdLabel}>Termina:</Text>
                <View style={styles.pdFieldCol}>
                  <TouchableOpacity
                    style={styles.pdFieldRow}
                    onPress={() => setEndMenuVisible(true)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.pdFieldText, { flex: 1 }]} numberOfLines={1}>
                      {endMenuLabel}
                    </Text>
                    <Text style={styles.pdFieldChevron}>▼</Text>
                  </TouchableOpacity>
                  {renderUnderline()}
                  {hasEndDate ? (
                    <TouchableOpacity
                      style={[styles.pdFieldRow, { marginTop: 6 }]}
                      onPress={() => setEndDatePickerVisible(true)}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel="Elegir fecha límite de repetición"
                    >
                      <Text style={[styles.pdFieldText, { flex: 1 }]}>
                        {endDateValid ? formatDisplayDate(endDateStr.trim()) : 'Toca para abrir el calendario'}
                      </Text>
                      <Text style={styles.pdFieldChevron}>▼</Text>
                    </TouchableOpacity>
                  ) : null}
                  {hasEndDate ? renderUnderline() : null}
                </View>
              </View>

              {freq === 'weekly' ? (
                <View style={styles.pdRow}>
                  <Text style={styles.pdLabel}>Repetir el:</Text>
                  <View style={styles.pdFieldCol}>
                    <View style={styles.weekdayRow}>
                      {WEEKDAY_LETTERS.map((letter, dayIndex) => {
                        const active = selectedWeekdays.includes(dayIndex);
                        return (
                          <TouchableOpacity
                            key={dayIndex}
                            style={[styles.weekdayBtn, active && styles.weekdayBtnActive]}
                            onPress={() => toggleWeekday(dayIndex)}
                            accessibilityLabel={WEEKDAY_LONG[dayIndex]}
                            accessibilityState={{ selected: active }}
                          >
                            <Text style={[styles.weekdayBtnText, active && styles.weekdayBtnTextActive]}>
                              {letter}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </View>
              ) : null}
            </>
          )}

          <View style={styles.summaryBox}>
            <Text style={styles.summaryText}>{summary}</Text>
          </View>
    </ScrollView>
  );

  return (
    <View style={{ flex: 1 }}>
      <PalmScreenShell title="Cambiar repetición" onClose={onDismiss} footer={footer}>
        {Platform.OS === 'ios' ? (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
            {scrollBody}
          </KeyboardAvoidingView>
        ) : (
          scrollBody
        )}
      </PalmScreenShell>

      {endMenuVisible ? (
        <ScreenOverlay zIndex={60}>
          <View style={styles.endMenuOverlay} pointerEvents="box-none">
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              activeOpacity={1}
              onPress={() => setEndMenuVisible(false)}
            />
            <View style={styles.subModalCard}>
              <TouchableOpacity
                style={styles.subModalOpt}
                onPress={() => {
                  setHasEndDate(false);
                  setEndDateStr('');
                  setEndMenuVisible(false);
                }}
              >
                <Text style={styles.subModalOptText}>Sin fecha final</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.subModalOpt}
                onPress={() => {
                  setHasEndDate(true);
                  setEndMenuVisible(false);
                  setEndDatePickerVisible(true);
                }}
              >
                <Text style={styles.subModalOptText}>Seleccionar fecha fin</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScreenOverlay>
      ) : null}

      {endDatePickerVisible ? (
        <ScreenOverlay zIndex={70}>
          <GoToDateScreen
            title="Termina el"
            initialDate={endDateValid ? endDateStr.trim() : getTodayISO()}
            onSelectDate={(dateISO) => {
              setEndDateStr(dateISO);
              setEndDatePickerVisible(false);
            }}
            onClose={() => setEndDatePickerVisible(false)}
          />
        </ScreenOverlay>
      ) : null}
    </View>
  );
}

/** @deprecated Usar ChangeRepeatScreen */
export type ChangeRepeatModalProps = ChangeRepeatScreenProps & { visible?: boolean };

/** @deprecated Usar ChangeRepeatScreen apilada en el padre */
export function ChangeRepeatModal({ visible = true, ...rest }: ChangeRepeatModalProps) {
  if (!visible) return null;
  return <ChangeRepeatScreen {...rest} />;
}
