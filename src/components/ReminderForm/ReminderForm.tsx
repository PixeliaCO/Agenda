/**
 * Modal para crear o editar un recordatorio.
 * Campos: título, descripción (opcional), hora inicio, hora fin.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Pressable,
} from 'react-native';
import type { Reminder, CreateReminderInput } from '../../types/reminder';
import { usePreferences } from '../../contexts/PreferencesContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { time24To12, time12To24 } from '../../utils/date';
import { scaledFontSize } from '../../utils/typography';

export type ReminderFormProps = {
  visible: boolean;
  /** Si se pasa, modo edición; si no, modo creación */
  reminder?: Reminder | null;
  /** Fecha del recordatorio (YYYY-MM-DD) */
  date: string;
  /** Hora del slot donde se pulsó (para prellenar en creación) */
  defaultStartTime?: string;
  onSave: (input: CreateReminderInput) => void;
  onUpdate: (id: string, input: { title?: string; description?: string; startTime?: string; endTime?: string }) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
};

export function ReminderForm({
  visible,
  reminder,
  date,
  defaultStartTime,
  onSave,
  onUpdate,
  onDelete,
  onClose,
}: ReminderFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startHour, setStartHour] = useState('');
  const [startMin, setStartMin] = useState('');
  const [startPm, setStartPm] = useState(false);
  const [endHour, setEndHour] = useState('');
  const [endMin, setEndMin] = useState('');
  const [endPm, setEndPm] = useState(false);

  const isEdit = Boolean(reminder?.id);
  const wasVisible = useRef(false);
  const insets = useSafeAreaInsets();
  const { colors, fontScale } = usePreferences();
  const fs = (n: number) => scaledFontSize(n, fontScale);
  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: colors.backdrop,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
          paddingTop: Math.max(20, insets.top + 8),
          paddingBottom: Math.max(20, insets.bottom + 8),
        },
        card: {
          width: '100%',
          maxWidth: 360,
          maxHeight: '88%',
          backgroundColor: colors.cardBackground,
          borderRadius: 0,
          overflow: 'hidden',
        },
        keyboardInner: { maxHeight: '100%' },
        header: {
          backgroundColor: colors.palmHeaderBg,
          paddingVertical: 14,
          paddingHorizontal: 16,
          alignItems: 'center',
        },
        headerTitle: {
          fontSize: fs(18),
          color: colors.palmHeaderText,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
        },
        body: {
          padding: 18,
          paddingBottom: 14,
        },
        scroll: {
          maxHeight: 320 + Math.round((fontScale - 1) * 36),
        },
        scrollContent: { paddingBottom: 8 },
        label: {
          fontSize: fs(14),
          color: colors.textSecondary,
          marginBottom: 6,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
        },
        input: {
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 0,
          paddingHorizontal: 12,
          paddingVertical: 10 + Math.round((fontScale - 1) * 2),
          fontSize: fs(16),
          color: colors.text,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
          backgroundColor: colors.fieldFill,
          marginBottom: 14,
        },
        inputMultiline: { minHeight: 64, textAlignVertical: 'top' },
        timeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 8, flexWrap: 'wrap' },
        timeInput: {
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 0,
          paddingHorizontal: 12,
          paddingVertical: 10 + Math.round((fontScale - 1) * 2),
          fontSize: fs(16),
          color: colors.text,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
          backgroundColor: colors.fieldFill,
          minWidth: 52,
          textAlign: 'center',
        },
        timeSeparator: { fontSize: fs(18), color: colors.textSecondary, fontFamily: 'PixelOperator', fontWeight: 'normal' },
        ampmRow: { flexDirection: 'row', marginLeft: 8, gap: 6 },
        ampmBtn: {
          paddingVertical: 8,
          paddingHorizontal: 14,
          borderRadius: 0,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: colors.fieldFill,
        },
        ampmBtnActive: { backgroundColor: colors.daySelectedBg, borderColor: colors.daySelectedBg },
        ampmText: { fontSize: fs(14), color: colors.textSecondary, fontFamily: 'PixelOperator', fontWeight: 'normal' },
        ampmTextActive: { color: colors.onAccentBg },
        actions: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginTop: 4,
          paddingTop: 16,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.line,
        },
        actionsRight: { flex: 1, flexDirection: 'row', gap: 10 },
        deleteBtn: { paddingVertical: 10, paddingHorizontal: 8 },
        deleteBtnText: { fontSize: fs(13), color: '#c62828', fontFamily: 'PixelOperator', fontWeight: 'normal' },
        btn: {
          flex: 1,
          paddingVertical: 12,
          borderRadius: 0,
          alignItems: 'center',
        },
        btnSecondary: {
          backgroundColor: colors.barBackground,
        },
        btnPrimary: {
          backgroundColor: colors.daySelectedBg,
        },
        btnText: {
          fontSize: fs(15),
          color: colors.text,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
        },
        btnTextPrimary: { color: colors.onAccentBg },
      }),
    [colors, fontScale, insets.top, insets.bottom]
  );

  useEffect(() => {
    if (visible && !wasVisible.current) {
      wasVisible.current = true;
      if (reminder) {
        setTitle(reminder.title);
        setDescription(reminder.description ?? '');
        const s = time24To12(reminder.startTime);
        setStartHour(String(s.hour));
        setStartMin(String(s.min));
        setStartPm(s.pm);
        const e = time24To12(reminder.endTime ?? addHour(reminder.startTime));
        setEndHour(String(e.hour));
        setEndMin(String(e.min));
        setEndPm(e.pm);
      } else {
        setTitle('');
        setDescription('');
        const start = defaultStartTime ?? '00:00';
        const s = time24To12(start);
        setStartHour(String(s.hour));
        setStartMin(String(s.min));
        setStartPm(s.pm);
        const e = time24To12(addHour(start));
        setEndHour(String(e.hour));
        setEndMin(String(e.min));
        setEndPm(e.pm);
      }
    }
    if (!visible) wasVisible.current = false;
  }, [visible, reminder, defaultStartTime]);

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

  const handleSave = () => {
    const t = title.trim();
    if (!t) return;
    const sh = parseHour(startHour);
    const sm = parseMin(startMin);
    const eh = parseHour(endHour);
    const em = parseMin(endMin);
    if (sh === null || sm === null) {
      Alert.alert('Hora requerida', 'Debes colocar la hora de inicio para continuar.');
      return;
    }
    if (eh === null || em === null) {
      Alert.alert('Hora requerida', 'Debes colocar la hora de fin para continuar.');
      return;
    }
    const startTime = time12To24(sh, sm, startPm);
    const endTime = time12To24(eh, em, endPm);
    if (isEdit && reminder) {
      onUpdate(reminder.id, { title: t, description: description.trim() || undefined, startTime, endTime });
    } else {
      onSave({ title: t, description: description.trim() || undefined, date, startTime, endTime });
    }
    onClose();
  };

  const onlyDigits = (v: string) => v.replace(/[^0-9]/g, '');

  const handleDelete = () => {
    if (isEdit && reminder && onDelete) {
      onDelete(reminder.id);
      onClose();
    }
  };

  if (!visible) return null;

  const keyboardVerticalOffset = Platform.OS === 'ios' ? Math.max(insets.top, 12) : 0;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
            style={styles.keyboardInner}
            keyboardVerticalOffset={keyboardVerticalOffset}
          >
            <View style={styles.header}>
              <Text style={styles.headerTitle}>{isEdit ? 'Editar evento' : 'Nuevo evento'}</Text>
            </View>
            <View style={styles.body}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator
              >
                <Text style={styles.label}>Razón del evento</Text>
                <TextInput
                  style={styles.input}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Ej. Reunión equipo"
                  placeholderTextColor={colors.textSecondary}
                />
              <Text style={styles.label}>Descripción (opcional)</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={description}
                onChangeText={setDescription}
                placeholder="Notas..."
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={2}
              />
              <Text style={styles.label}>Hora inicio</Text>
              <View style={styles.timeRow}>
                <TextInput
                  style={styles.timeInput}
                  value={startHour}
                  onChangeText={(v) => setStartHour(onlyDigits(v).slice(0, 2))}
                  keyboardType="number-pad"
                  placeholder="00"
                  placeholderTextColor={colors.textSecondary}
                  maxLength={2}
                />
                <Text style={styles.timeSeparator}>:</Text>
                <TextInput
                  style={styles.timeInput}
                  value={startMin}
                  onChangeText={(v) => setStartMin(onlyDigits(v).slice(0, 2))}
                  keyboardType="number-pad"
                  placeholder="00"
                  placeholderTextColor={colors.textSecondary}
                  maxLength={2}
                />
                <View style={styles.ampmRow}>
                  <TouchableOpacity
                    style={[styles.ampmBtn, !startPm && styles.ampmBtnActive]}
                    onPress={() => setStartPm(false)}
                  >
                    <Text style={[styles.ampmText, !startPm && styles.ampmTextActive]}>a. m.</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.ampmBtn, startPm && styles.ampmBtnActive]}
                    onPress={() => setStartPm(true)}
                  >
                    <Text style={[styles.ampmText, startPm && styles.ampmTextActive]}>p. m.</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.label}>Hora fin</Text>
              <View style={styles.timeRow}>
                <TextInput
                  style={styles.timeInput}
                  value={endHour}
                  onChangeText={(v) => setEndHour(onlyDigits(v).slice(0, 2))}
                  keyboardType="number-pad"
                  placeholder="00"
                  placeholderTextColor={colors.textSecondary}
                  maxLength={2}
                />
                <Text style={styles.timeSeparator}>:</Text>
                <TextInput
                  style={styles.timeInput}
                  value={endMin}
                  onChangeText={(v) => setEndMin(onlyDigits(v).slice(0, 2))}
                  keyboardType="number-pad"
                  placeholder="00"
                  placeholderTextColor={colors.textSecondary}
                  maxLength={2}
                />
                <View style={styles.ampmRow}>
                  <TouchableOpacity
                    style={[styles.ampmBtn, !endPm && styles.ampmBtnActive]}
                    onPress={() => setEndPm(false)}
                  >
                    <Text style={[styles.ampmText, !endPm && styles.ampmTextActive]}>a. m.</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.ampmBtn, endPm && styles.ampmBtnActive]}
                    onPress={() => setEndPm(true)}
                  >
                    <Text style={[styles.ampmText, endPm && styles.ampmTextActive]}>p. m.</Text>
                  </TouchableOpacity>
                </View>
              </View>
              </ScrollView>
              <View style={styles.actions}>
                {isEdit && onDelete ? (
                  <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
                    <Text style={styles.deleteBtnText}>Eliminar</Text>
                  </TouchableOpacity>
                ) : null}
                <View style={styles.actionsRight}>
                  <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={onClose}>
                    <Text style={styles.btnText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnPrimary, !title.trim() && { opacity: 0.5 }]}
                    onPress={handleSave}
                    disabled={!title.trim()}
                  >
                    <Text style={[styles.btnText, styles.btnTextPrimary]}>Guardar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function addHour(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const next = h + 1;
  const hour = next > 23 ? 0 : next;
  return `${hour < 10 ? '0' + hour : hour}:${m < 10 ? '0' + m : m}`;
}

