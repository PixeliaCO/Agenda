/**
 * Pantalla de opciones: tamaño de letra, modo oscuro e intervalo horario del día.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { usePreferences } from '../contexts/PreferencesContext';
import type { FontSizeKey } from '../contexts/PreferencesContext';
import { getDaySchedule, setDaySchedule, clearDaySchedule } from '../services/dayScheduleService';
import { formatDateFull } from '../utils/date';
import { scaledFontSize, titleFont } from '../utils/typography';
import { PalmScreenShell } from '../components/PalmScreenShell';
import {
  getAndroidAlarmWakeDiagnostics,
  openAndroidAppNotificationSettings,
  openAndroidAppDetailsSettings,
  openAndroidExactAlarmPermissionSettings,
  openAndroidManageFullScreenIntentSettings,
  openAndroidOverlayPermissionSettings,
  resyncAllScheduledNotifications,
  type AndroidAlarmWakeDiagnostics,
} from '../services/localNotificationService';

export type OptionsScreenProps = {
  onClose: () => void;
  /** Fecha actualmente seleccionada (YYYY-MM-DD) para configurar intervalo del día */
  selectedDate?: string;
  /** Se llama después de guardar o borrar el intervalo del día */
  onDayScheduleSaved?: () => void;
};

const FONT_OPTIONS: { key: FontSizeKey; label: string }[] = [
  { key: 'small', label: 'Pequeño' },
  { key: 'normal', label: 'Normal' },
  { key: 'large', label: 'Grande' },
];

/** Diagnóstico de alarmas Android (Notifee). Oculto en producción; poner true para depurar. */
const SHOW_ANDROID_ALARM_DIAGNOSTICS = false;

function hour24To12h(h24: number): { hour: number; pm: boolean } {
  if (h24 === 0) return { hour: 12, pm: false };
  if (h24 === 12) return { hour: 12, pm: true };
  return { hour: h24 > 12 ? h24 - 12 : h24, pm: h24 >= 12 };
}
function hour12To24h(hour: number, pm: boolean): number {
  const h = Math.max(1, Math.min(12, hour));
  if (h === 12) return pm ? 12 : 0;
  return pm ? h + 12 : h;
}

export function OptionsScreen({ onClose, selectedDate, onDayScheduleSaved }: OptionsScreenProps) {
  const { preferences, setFontSize, setDarkMode, setAlarmBehavior, fontScale, colors } = usePreferences();
  const [dayStartHour, setDayStartHour] = useState('8');
  const [dayStartPm, setDayStartPm] = useState(false);
  const [dayEndHour, setDayEndHour] = useState('6');
  const [dayEndPm, setDayEndPm] = useState(true);
  const [keyboardPad, setKeyboardPad] = useState(0);
  const [alarmSnoozeStr, setAlarmSnoozeStr] = useState(String(preferences.alarmSnoozeMinutes));
  const [alarmRepeatIntervalStr, setAlarmRepeatIntervalStr] = useState(
    String(preferences.alarmRepeatIntervalMinutes)
  );
  const [alarmRepeatCountStr, setAlarmRepeatCountStr] = useState(String(preferences.alarmRepeatCount));

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
    if (selectedDate) {
      const day = getDaySchedule(selectedDate);
      const start24 = day?.startHour ?? preferences.scheduleStartHour;
      const end24 = day?.endHour ?? preferences.scheduleEndHour;
      const start12 = hour24To12h(start24);
      const end12 = hour24To12h(end24);
      setDayStartHour(String(start12.hour));
      setDayStartPm(start12.pm);
      setDayEndHour(String(end12.hour));
      setDayEndPm(end12.pm);
    }
  }, [selectedDate, preferences.scheduleStartHour, preferences.scheduleEndHour]);

  useEffect(() => {
    setAlarmSnoozeStr(String(preferences.alarmSnoozeMinutes));
    setAlarmRepeatIntervalStr(String(preferences.alarmRepeatIntervalMinutes));
    setAlarmRepeatCountStr(String(preferences.alarmRepeatCount));
  }, [preferences.alarmSnoozeMinutes, preferences.alarmRepeatIntervalMinutes, preferences.alarmRepeatCount]);

  const clampAlarmField = (raw: string, fallback: number, max: number): number => {
    const v = parseInt(raw.trim(), 10);
    if (Number.isNaN(v)) return fallback;
    return Math.max(1, Math.min(max, v));
  };

  const clampRepeatCountField = (raw: string, fallback: number): number => {
    const v = parseInt(raw.trim(), 10);
    if (Number.isNaN(v)) return fallback;
    return Math.max(0, Math.min(10, v));
  };

  const handleSaveAlarmBehavior = async () => {
    const snooze = clampAlarmField(alarmSnoozeStr, preferences.alarmSnoozeMinutes, 120);
    const interval = clampAlarmField(alarmRepeatIntervalStr, preferences.alarmRepeatIntervalMinutes, 120);
    const count = clampRepeatCountField(alarmRepeatCountStr, preferences.alarmRepeatCount);
    setAlarmSnoozeStr(String(snooze));
    setAlarmRepeatIntervalStr(String(interval));
    setAlarmRepeatCountStr(String(count));
    setAlarmBehavior(snooze, interval, count);
    await resyncAllScheduledNotifications();
  };

  const [androidAlarmDiag, setAndroidAlarmDiag] = useState<AndroidAlarmWakeDiagnostics | null>(null);
  const [androidAlarmDiagLoading, setAndroidAlarmDiagLoading] = useState(false);

  const refreshAndroidAlarmDiagnostics = useCallback(async () => {
    if (Platform.OS !== 'android' || !SHOW_ANDROID_ALARM_DIAGNOSTICS) return;
    setAndroidAlarmDiagLoading(true);
    try {
      const d = await getAndroidAlarmWakeDiagnostics();
      setAndroidAlarmDiag(d);
    } catch {
      setAndroidAlarmDiag(null);
    } finally {
      setAndroidAlarmDiagLoading(false);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android' || !SHOW_ANDROID_ALARM_DIAGNOSTICS) return;
    void refreshAndroidAlarmDiagnostics();
  }, [refreshAndroidAlarmDiagnostics]);

  const handleSaveDaySchedule = () => {
    if (!selectedDate) return;
    const sh = parseInt(dayStartHour, 10);
    const eh = parseInt(dayEndHour, 10);
    if (Number.isNaN(sh) || Number.isNaN(eh)) return;
    const start24 = hour12To24h(sh, dayStartPm);
    const end24 = hour12To24h(eh, dayEndPm);
    setDaySchedule(selectedDate, start24, end24);
    onDayScheduleSaved?.();
  };

  const handleUseDefaultSchedule = () => {
    if (!selectedDate) return;
    clearDaySchedule(selectedDate);
    const start12 = hour24To12h(preferences.scheduleStartHour);
    const end12 = hour24To12h(preferences.scheduleEndHour);
    setDayStartHour(String(start12.hour));
    setDayStartPm(start12.pm);
    setDayEndHour(String(end12.hour));
    setDayEndPm(end12.pm);
    onDayScheduleSaved?.();
  };

  const onlyDigits = (v: string) => v.replace(/[^0-9]/g, '');

  const baseFs = (n: number) => scaledFontSize(n, fontScale);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scrollContent: { padding: 10, paddingBottom: 12 },
        section: { marginBottom: 14 },
        sectionTitle: {
          fontSize: baseFs(13),
          color: colors.textSecondary,
          marginBottom: 8,
          ...titleFont,
        },
        optionGrid: {
          borderWidth: 1,
          borderColor: colors.agendaHeaderBorder,
        },
        optionRow: { flexDirection: 'row' },
        optionCell: {
          flex: 1,
          paddingVertical: 10,
          alignItems: 'center',
          justifyContent: 'center',
          borderRightWidth: 1,
          borderBottomWidth: 1,
          borderColor: colors.agendaHeaderBorder,
          backgroundColor: colors.viewScreenBackground,
        },
        optionCellLast: { borderRightWidth: 0 },
        optionCellLastRow: { borderBottomWidth: 0 },
        optionCellSelected: { backgroundColor: colors.agendaHeaderSelectedBg },
        optionCellText: {
          fontSize: baseFs(14),
          color: colors.text,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
        },
        optionCellTextSelected: { color: colors.agendaHeaderSelectedText },
        sectionBlock: {
          borderWidth: 1,
          borderColor: colors.strongBorder,
          backgroundColor: colors.fieldFill,
          paddingHorizontal: 12,
          paddingVertical: 10,
        },
        rowLabel: {
          fontSize: baseFs(14),
          color: colors.text,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
          minWidth: 44,
        },
        dayScheduleLabel: {
          fontSize: baseFs(13),
          color: colors.textSecondary,
          marginBottom: 10,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
        },
        dayScheduleRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
        },
        dayScheduleInput: {
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 0,
          paddingHorizontal: 10,
          paddingVertical: 8,
          fontSize: baseFs(15),
          color: colors.text,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
          minWidth: 44,
          textAlign: 'center',
          backgroundColor: colors.viewScreenBackground,
        },
        ampmBtn: {
          paddingVertical: 8,
          paddingHorizontal: 10,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.footerText,
          backgroundColor: colors.viewScreenBackground,
        },
        ampmBtnActive: {
          backgroundColor: colors.agendaHeaderSelectedBg,
          borderColor: colors.agendaHeaderSelectedBg,
        },
        ampmBtnText: {
          fontSize: baseFs(13),
          color: colors.footerText,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
        },
        ampmBtnTextActive: { color: colors.onAccentBg },
        actionRow: {
          flexDirection: 'row',
          gap: 8,
          marginTop: 4,
        },
        actionBtn: {
          flex: 1,
          paddingVertical: 8,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.footerText,
          backgroundColor: colors.viewScreenBackground,
          alignItems: 'center',
        },
        actionBtnText: {
          fontSize: baseFs(13),
          color: colors.footerText,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
        },
        androidBtn: {
          paddingVertical: 8,
          paddingHorizontal: 10,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.footerText,
          backgroundColor: colors.viewScreenBackground,
          marginBottom: 8,
          alignItems: 'center',
        },
        androidBtnText: {
          fontSize: baseFs(13),
          color: colors.footerText,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
          textAlign: 'center',
        },
        diagHint: {
          fontSize: baseFs(12),
          color: colors.textSecondary,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
          marginBottom: 10,
          lineHeight: baseFs(17),
        },
        diagRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          marginBottom: 6,
          paddingVertical: 2,
        },
        diagKey: {
          fontSize: baseFs(13),
          color: colors.textSecondary,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
          flex: 1,
        },
        diagVal: {
          fontSize: baseFs(13),
          color: colors.text,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
          maxWidth: '52%',
          textAlign: 'right',
        },
        diagValAttention: { color: '#ca8a04' },
        diagValOk: { color: colors.agendaHeaderSelectedBg },
        footer: {
          flexDirection: 'row',
          paddingHorizontal: 14,
          paddingTop: 12,
          gap: 12,
        },
        footerBtn: {
          flex: 1,
          paddingVertical: 10,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.footerText,
          backgroundColor: colors.viewScreenBackground,
          alignItems: 'center',
        },
        footerBtnText: {
          fontSize: baseFs(15),
          color: colors.footerText,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
        },
      }),
    [colors, fontScale]
  );

  const footer = (
    <View style={styles.footer}>
      <TouchableOpacity style={styles.footerBtn} onPress={onClose}>
        <Text style={styles.footerBtnText}>OK</Text>
      </TouchableOpacity>
    </View>
  );

  const scrollContent = (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, { paddingBottom: keyboardPad + 12 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tamaño de letra</Text>
        <View style={styles.optionGrid}>
          <View style={styles.optionRow}>
            {FONT_OPTIONS.map(({ key, label }, col) => {
              const selected = preferences.fontSize === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.optionCell,
                    col === FONT_OPTIONS.length - 1 && styles.optionCellLast,
                    styles.optionCellLastRow,
                    selected && styles.optionCellSelected,
                  ]}
                  onPress={() => setFontSize(key)}
                >
                  <Text
                    style={[
                      styles.optionCellText,
                      selected && styles.optionCellTextSelected,
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Apariencia</Text>
        <View style={styles.optionGrid}>
          <View style={styles.optionRow}>
            <TouchableOpacity
              style={[
                styles.optionCell,
                !preferences.darkMode && styles.optionCellSelected,
              ]}
              onPress={() => setDarkMode(false)}
            >
              <Text
                style={[
                  styles.optionCellText,
                  !preferences.darkMode && styles.optionCellTextSelected,
                ]}
              >
                Claro
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.optionCell,
                styles.optionCellLast,
                styles.optionCellLastRow,
                preferences.darkMode && styles.optionCellSelected,
              ]}
              onPress={() => setDarkMode(true)}
            >
              <Text
                style={[
                  styles.optionCellText,
                  preferences.darkMode && styles.optionCellTextSelected,
                ]}
              >
                Oscuro
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {Platform.OS === 'android' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Alarmas</Text>
          <View style={styles.sectionBlock}>
            <Text style={styles.diagHint}>
              Si no respondes, la alarma vuelve a sonar automáticamente. «Recordar nuevamente» pospone el aviso.
            </Text>
            <View style={styles.dayScheduleRow}>
              <Text style={styles.rowLabel}>Posponer</Text>
              <TextInput
                style={styles.dayScheduleInput}
                value={alarmSnoozeStr}
                onChangeText={(t) => setAlarmSnoozeStr(onlyDigits(t).slice(0, 3))}
                keyboardType="number-pad"
                placeholder="5"
                placeholderTextColor={colors.textSecondary}
              />
              <Text style={styles.rowLabel}>min</Text>
            </View>
            <View style={styles.dayScheduleRow}>
              <Text style={styles.rowLabel}>Re-sonido</Text>
              <TextInput
                style={styles.dayScheduleInput}
                value={alarmRepeatIntervalStr}
                onChangeText={(t) => setAlarmRepeatIntervalStr(onlyDigits(t).slice(0, 3))}
                keyboardType="number-pad"
                placeholder="5"
                placeholderTextColor={colors.textSecondary}
              />
              <Text style={styles.rowLabel}>min</Text>
            </View>
            <View style={styles.dayScheduleRow}>
              <Text style={styles.rowLabel}>Repetir</Text>
              <TextInput
                style={styles.dayScheduleInput}
                value={alarmRepeatCountStr}
                onChangeText={(t) => setAlarmRepeatCountStr(onlyDigits(t).slice(0, 2))}
                keyboardType="number-pad"
                placeholder="4"
                placeholderTextColor={colors.textSecondary}
              />
              <Text style={styles.rowLabel}>veces</Text>
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => void handleSaveAlarmBehavior()}>
                <Text style={styles.actionBtnText}>Guardar alarmas</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={[styles.sectionTitle, { marginTop: 10 }]}>Permisos del sistema</Text>
          <TouchableOpacity
            style={styles.androidBtn}
            onPress={() => void openAndroidAppNotificationSettings()}
          >
            <Text style={styles.androidBtnText}>Ajustes de notificación de la app</Text>
          </TouchableOpacity>
          {typeof Platform.Version === 'number' && Platform.Version >= 34 ? (
            <TouchableOpacity
              style={styles.androidBtn}
              onPress={() => void openAndroidManageFullScreenIntentSettings()}
            >
              <Text style={styles.androidBtnText}>Permitir pantalla completa en alarmas</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.androidBtn}
            onPress={() => void openAndroidOverlayPermissionSettings()}
          >
            <Text style={styles.androidBtnText}>Mostrar sobre otras apps (Lock Screen automática)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.androidBtn} onPress={() => void openAndroidExactAlarmPermissionSettings()}>
            <Text style={styles.androidBtnText}>Permiso de alarmas exactas</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.androidBtn} onPress={() => void openAndroidAppDetailsSettings()}>
            <Text style={styles.androidBtnText}>Detalles de la app (batería)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.androidBtn, { marginBottom: 0 }]}
            onPress={async () => {
              await resyncAllScheduledNotifications();
              await refreshAndroidAlarmDiagnostics();
            }}
          >
            <Text style={styles.androidBtnText}>Reprogramar todas las alarmas</Text>
          </TouchableOpacity>
        </View>
      )}

      {Platform.OS === 'android' && SHOW_ANDROID_ALARM_DIAGNOSTICS && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Diagnóstico de alarmas</Text>
          <View style={styles.sectionBlock}>
            <Text style={styles.diagHint}>
              Estado del dispositivo (Notifee / sistema). Si algo sale en aviso, usa los botones de abajo y pulsa
              «Actualizar estado». No aplica en Expo Go.
            </Text>
            {androidAlarmDiagLoading ? (
              <Text style={[styles.diagKey, { marginBottom: 10 }]}>Cargando estado…</Text>
            ) : androidAlarmDiag == null ? (
              <Text style={[styles.diagVal, styles.diagValAttention, { marginBottom: 10 }]}>
                No se pudo leer el estado.
              </Text>
            ) : (
              <View style={{ marginBottom: 10 }}>
                {(() => {
                  const d = androidAlarmDiag;
                  const chText = (v: boolean | null) => (v === null ? '—' : v ? 'OK' : 'Falta');
                  const chStyle = (v: boolean | null) =>
                    v === null
                      ? [styles.diagVal]
                      : v
                        ? [styles.diagVal, styles.diagValOk]
                        : [styles.diagVal, styles.diagValAttention];
                  const trig =
                    d.scheduledTriggerCount == null ? '—' : String(d.scheduledTriggerCount);
                  return (
                    <>
                      <View style={styles.diagRow}>
                        <Text style={styles.diagKey}>Notificaciones</Text>
                        <Text
                          style={
                            d.postNotificationsAuthorized
                              ? [styles.diagVal, styles.diagValOk]
                              : [styles.diagVal, styles.diagValAttention]
                          }
                        >
                          {d.postNotificationsAuthorized ? 'Sí' : 'No'}
                        </Text>
                      </View>
                      <View style={styles.diagRow}>
                        <Text style={styles.diagKey}>Alarmas exactas</Text>
                        <Text
                          style={
                            d.alarmSchedulingEnabled
                              ? [styles.diagVal, styles.diagValOk]
                              : [styles.diagVal, styles.diagValAttention]
                          }
                        >
                          {d.alarmSchedulingEnabled ? 'Sí' : 'No'}
                        </Text>
                      </View>
                      <View style={styles.diagRow}>
                        <Text style={styles.diagKey}>Canal inicio (alarma)</Text>
                        <Text style={chStyle(d.startChannelReady)}>{chText(d.startChannelReady)}</Text>
                      </View>
                      <View style={styles.diagRow}>
                        <Text style={styles.diagKey}>Canal anticipación</Text>
                        <Text style={chStyle(d.anticipationChannelReady)}>{chText(d.anticipationChannelReady)}</Text>
                      </View>
                      <View style={styles.diagRow}>
                        <Text style={styles.diagKey}>Triggers programados</Text>
                        <Text style={styles.diagVal}>{trig}</Text>
                      </View>
                      <View style={styles.diagRow}>
                        <Text style={styles.diagKey}>Android API</Text>
                        <Text style={styles.diagVal}>{String(d.androidApiLevel)}</Text>
                      </View>
                    </>
                  );
                })()}
              </View>
            )}
          </View>
          <TouchableOpacity
            style={styles.androidBtn}
            onPress={() => void refreshAndroidAlarmDiagnostics()}
          >
            <Text style={styles.androidBtnText}>Actualizar estado de alarmas</Text>
          </TouchableOpacity>
        </View>
      )}

      {selectedDate && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Intervalo del día</Text>
          <View style={styles.sectionBlock}>
            <Text style={styles.dayScheduleLabel}>
              Para el {formatDateFull(selectedDate)}
            </Text>
            <View style={styles.dayScheduleRow}>
              <Text style={styles.rowLabel}>Inicio</Text>
              <TextInput
                style={styles.dayScheduleInput}
                value={dayStartHour}
                onChangeText={(t) => setDayStartHour(onlyDigits(t).slice(0, 2))}
                keyboardType="number-pad"
                placeholder="8"
                placeholderTextColor={colors.textSecondary}
              />
              <TouchableOpacity
                style={[styles.ampmBtn, !dayStartPm && styles.ampmBtnActive]}
                onPress={() => setDayStartPm(false)}
              >
                <Text style={[styles.ampmBtnText, !dayStartPm && styles.ampmBtnTextActive]}>a. m.</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ampmBtn, dayStartPm && styles.ampmBtnActive]}
                onPress={() => setDayStartPm(true)}
              >
                <Text style={[styles.ampmBtnText, dayStartPm && styles.ampmBtnTextActive]}>p. m.</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.dayScheduleRow}>
              <Text style={styles.rowLabel}>Fin</Text>
              <TextInput
                style={styles.dayScheduleInput}
                value={dayEndHour}
                onChangeText={(t) => setDayEndHour(onlyDigits(t).slice(0, 2))}
                keyboardType="number-pad"
                placeholder="6"
                placeholderTextColor={colors.textSecondary}
              />
              <TouchableOpacity
                style={[styles.ampmBtn, !dayEndPm && styles.ampmBtnActive]}
                onPress={() => setDayEndPm(false)}
              >
                <Text style={[styles.ampmBtnText, !dayEndPm && styles.ampmBtnTextActive]}>a. m.</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ampmBtn, dayEndPm && styles.ampmBtnActive]}
                onPress={() => setDayEndPm(true)}
              >
                <Text style={[styles.ampmBtnText, dayEndPm && styles.ampmBtnTextActive]}>p. m.</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionBtn} onPress={handleSaveDaySchedule}>
                <Text style={styles.actionBtnText}>Guardar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={handleUseDefaultSchedule}>
                <Text style={styles.actionBtnText}>Por defecto</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.viewScreenBackground }}>
      <StatusBar style={preferences.darkMode ? 'light' : 'dark'} />
      <PalmScreenShell
        title="Opciones"
        onClose={onClose}
        footer={footer}
        footerStyle={{
          backgroundColor: colors.viewScreenBackground,
          borderTopWidth: 0,
        }}
      >
        {Platform.OS === 'ios' ? (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
            {scrollContent}
          </KeyboardAvoidingView>
        ) : (
          scrollContent
        )}
      </PalmScreenShell>
    </View>
  );
}

/** @deprecated Usar OptionsScreen */
export type OptionsModalProps = OptionsScreenProps & { visible?: boolean };

/** @deprecated Usar OptionsScreen como pantalla completa */
export function OptionsModal({ visible = true, ...rest }: OptionsModalProps) {
  if (!visible) return null;
  return <OptionsScreen {...rest} />;
}
