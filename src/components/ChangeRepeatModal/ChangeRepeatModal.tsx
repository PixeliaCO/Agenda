/**
 * Modal estilo Palm OS para configurar la repetición del evento.
 */

import React, { useState, useEffect, useMemo, Fragment } from 'react';
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
} from 'react-native';
import type { Reminder } from '../../types/reminder';
import { formatDisplayDate, getTodayISO } from '../../utils/date';
import { usePreferences } from '../../contexts/PreferencesContext';
import { scaledFontSize } from '../../utils/typography';
import { GoToDateModal } from '../GoToDateModal';

export type RepeatFrequency = NonNullable<Reminder['repeat']>;

type ChangeRepeatModalProps = {
  visible: boolean;
  /** Valores confirmados del padre (se copian al abrir) */
  frequency: RepeatFrequency;
  interval: number;
  endDateISO?: string;
  onApply: (frequency: RepeatFrequency, interval: number, endDateISO?: string) => void;
  onDismiss: () => void;
};

const FREQ_TABS: { value: RepeatFrequency; label: string }[] = [
  { value: 'none', label: 'No' },
  { value: 'daily', label: 'Día' },
  { value: 'weekly', label: 'Semana' },
  { value: 'monthly', label: 'Mes' },
  { value: 'yearly', label: 'Año' },
];

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

export function buildRepeatSummary(
  frequency: RepeatFrequency,
  interval: number,
  endDateISO?: string
): string {
  if (frequency === 'none') return 'No se repite';

  const n = Math.max(1, interval);
  let core = '';
  switch (frequency) {
    case 'daily':
      core = n === 1 ? 'Cada día' : `Cada ${n} días`;
      break;
    case 'weekly':
      core = n === 1 ? 'Cada semana' : `Cada ${n} semanas`;
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

export function ChangeRepeatModal({
  visible,
  frequency,
  interval,
  endDateISO,
  onApply,
  onDismiss,
}: ChangeRepeatModalProps) {
  const { colors, fontScale } = usePreferences();
  const [freq, setFreq] = useState<RepeatFrequency>(frequency);
  const [everyStr, setEveryStr] = useState(String(interval));
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endDateStr, setEndDateStr] = useState('');
  const [endMenuVisible, setEndMenuVisible] = useState(false);
  const [endDatePickerVisible, setEndDatePickerVisible] = useState(false);

  useEffect(() => {
    if (!visible) {
      setEndDatePickerVisible(false);
      return;
    }
    setFreq(frequency);
    setEveryStr(String(Math.max(1, interval)));
    const end = endDateISO && /^\d{4}-\d{2}-\d{2}$/.test(endDateISO) ? endDateISO : '';
    setHasEndDate(!!end);
    setEndDateStr(end);
    setEndMenuVisible(false);
  }, [visible, frequency, interval, endDateISO]);

  const summary = useMemo(() => buildRepeatSummary(freq, parseInt(everyStr, 10) || 1, hasEndDate ? endDateStr : undefined), [freq, everyStr, hasEndDate, endDateStr]);

  const onlyDigits = (v: string) => v.replace(/[^0-9]/g, '');

  const endDateValid = /^\d{4}-\d{2}-\d{2}$/.test(endDateStr.trim());

  const handleOK = () => {
    if (freq === 'none') {
      onApply('none', 1, undefined);
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
    if (hasEndDate) {
      if (!endDateValid) {
        Alert.alert('Repetición', 'Elige una fecha límite en el calendario.');
        return;
      }
      onApply(freq, n, endDateStr.trim());
    } else {
      onApply(freq, n, undefined);
    }
  };

  const endMenuLabel = hasEndDate
    ? endDateValid
      ? formatDisplayDate(endDateStr.trim())
      : 'Elegir fecha…'
    : 'Sin fecha límite';

  const styles = useMemo(() => {
    const fs = (n: number) => scaledFontSize(n, fontScale);
    return StyleSheet.create({
        root: { flex: 1 },
        backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.backdrop },
        centerWrap: { flex: 1, justifyContent: 'center' as const, padding: 16 },
        endMenuOverlay: {
          ...StyleSheet.absoluteFillObject,
          justifyContent: 'center' as const,
          alignItems: 'center' as const,
          zIndex: 50,
        },
        card: {
          backgroundColor: colors.cardBackground,
          borderRadius: 0,
          borderWidth: 2,
          borderColor: colors.strongBorder,
          overflow: 'hidden',
          maxHeight: '90%',
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: colors.palmHeaderBg,
          paddingVertical: 10,
          paddingHorizontal: 12,
        },
        headerTitle: { color: colors.palmHeaderText, fontSize: fs(16), fontFamily: 'PixelOperator', fontWeight: 'normal' },
        headerInfo: {
          color: colors.palmHeaderText,
          fontSize: fs(14),
          opacity: 0.85,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
        },
        body: { padding: 12 },
        tabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
        tab: {
          paddingVertical: 8,
          paddingHorizontal: 10,
          borderRadius: 0,
          borderWidth: 1,
          borderColor: colors.strongBorder,
          minWidth: 52,
          alignItems: 'center',
        },
        tabIdle: { backgroundColor: colors.chipIdleBg },
        tabActive: { backgroundColor: colors.daySelectedBg },
        tabText: { color: colors.chipIdleText, fontSize: fs(12), fontFamily: 'PixelOperator', fontWeight: 'normal' },
        tabTextActive: { color: colors.onAccentBg },
        configBlock: { marginBottom: 12 },
        configRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
        configLabel: { color: colors.text, fontSize: fs(14), fontFamily: 'PixelOperator', fontWeight: 'normal' },
        everyInput: {
          backgroundColor: colors.fieldFill,
          borderWidth: 1,
          borderColor: colors.strongBorder,
          borderRadius: 0,
          minWidth: 44,
          paddingVertical: 6,
          paddingHorizontal: 8,
          fontSize: fs(15),
          color: colors.text,
          textAlign: 'center',
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
        },
        unitText: { color: colors.text, fontSize: fs(14), fontFamily: 'PixelOperator', fontWeight: 'normal' },
        endTrigger: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: colors.fieldFill,
          borderWidth: 1,
          borderColor: colors.strongBorder,
          borderRadius: 0,
          paddingVertical: 8,
          paddingHorizontal: 10,
          alignSelf: 'flex-start',
        },
        endTriggerText: { color: colors.text, fontSize: fs(13), maxWidth: 220, fontFamily: 'PixelOperator', fontWeight: 'normal' },
        summaryBox: {
          borderWidth: 1,
          borderColor: colors.strongBorder,
          backgroundColor: colors.todayCellBg,
          padding: 12,
          minHeight: 56,
          marginTop: 4,
          marginBottom: 14,
        },
        summaryText: {
          color: colors.text,
          fontSize: fs(14),
          lineHeight: Math.round(fs(14) * 1.35),
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
        },
        footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 4, paddingBottom: 4 },
        footerBtn: {
          paddingVertical: 10,
          paddingHorizontal: 22,
          borderRadius: 0,
          backgroundColor: colors.palmMintBg,
          borderWidth: 2,
          borderColor: colors.palmMintBorder,
        },
        footerBtnText: { color: colors.text, fontSize: fs(15), fontFamily: 'PixelOperator', fontWeight: 'normal' },
        endDatePickTrigger: {
          marginTop: 8,
          backgroundColor: colors.fieldFill,
          borderWidth: 1,
          borderColor: colors.strongBorder,
          borderRadius: 0,
          paddingVertical: 10,
          paddingHorizontal: 12,
        },
        endDatePickLabel: {
          fontSize: fs(12),
          color: colors.textSecondary,
          marginBottom: 4,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
        },
        endDatePickValue: { fontSize: fs(15), color: colors.text, fontFamily: 'PixelOperator', fontWeight: 'normal' },
        subModalCard: {
          backgroundColor: colors.cardBackground,
          borderRadius: 0,
          borderWidth: 2,
          borderColor: colors.strongBorder,
          paddingVertical: 8,
          minWidth: 240,
          zIndex: 2,
          elevation: 6,
        },
        subModalOpt: { paddingVertical: 12, paddingHorizontal: 16 },
        subModalOptText: { color: colors.text, fontSize: fs(15), fontFamily: 'PixelOperator', fontWeight: 'normal' },
      });
  }, [colors, fontScale]);

  return (
    <Fragment>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.root}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onDismiss} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.centerWrap}
          pointerEvents="box-none"
        >
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
            <View style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Cambiar repetición</Text>
              <Text style={styles.headerInfo} accessibilityLabel="Información">
                ⓘ
              </Text>
            </View>
            <View style={styles.body}>
              <View style={styles.tabRow}>
                {FREQ_TABS.map((t) => (
                  <TouchableOpacity
                    key={t.value}
                    style={[styles.tab, freq === t.value ? styles.tabActive : styles.tabIdle]}
                    onPress={() => setFreq(t.value)}
                  >
                    <Text style={[styles.tabText, freq === t.value && styles.tabTextActive]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {freq !== 'none' ? (
                <View style={styles.configBlock}>
                  <View style={styles.configRow}>
                    <Text style={styles.configLabel}>Cada:</Text>
                    <TextInput
                      style={styles.everyInput}
                      value={everyStr}
                      onChangeText={(v) => setEveryStr(onlyDigits(v).slice(0, 3))}
                      keyboardType="number-pad"
                    />
                    <Text style={styles.unitText}>{unitLabel(freq)}</Text>
                  </View>
                  <Text style={styles.configLabel}>Finaliza:</Text>
                  <TouchableOpacity style={styles.endTrigger} onPress={() => setEndMenuVisible(true)}>
                    <Text style={styles.endTriggerText}>▼ {endMenuLabel}</Text>
                  </TouchableOpacity>
                  {hasEndDate ? (
                    <TouchableOpacity
                      style={styles.endDatePickTrigger}
                      onPress={() => setEndDatePickerVisible(true)}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel="Elegir fecha límite de repetición"
                    >
                      <Text style={styles.endDatePickLabel}>Fecha límite</Text>
                      <Text style={styles.endDatePickValue}>
                        {endDateValid ? formatDisplayDate(endDateStr.trim()) : 'Toca para abrir el calendario'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.summaryBox}>
                <Text style={styles.summaryText}>{summary}</Text>
              </View>

              <View style={styles.footer}>
                <TouchableOpacity style={styles.footerBtn} onPress={handleOK}>
                  <Text style={styles.footerBtnText}>OK</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.footerBtn} onPress={onDismiss}>
                  <Text style={styles.footerBtnText}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>

        {endMenuVisible ? (
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
                <Text style={styles.subModalOptText}>Sin fecha límite</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.subModalOpt}
                onPress={() => {
                  setHasEndDate(true);
                  setEndMenuVisible(false);
                  setEndDatePickerVisible(true);
                }}
              >
                <Text style={styles.subModalOptText}>Con fecha de fin…</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>

    <GoToDateModal
      visible={endDatePickerVisible}
      title="Fecha límite"
      initialDate={endDateValid ? endDateStr.trim() : getTodayISO()}
      onSelectDate={(dateISO) => {
        setEndDateStr(dateISO);
        setEndDatePickerVisible(false);
      }}
      onClose={() => setEndDatePickerVisible(false)}
    />
    </Fragment>
  );
}
