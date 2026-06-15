/**
 * Modal de Opciones: tamaño de letra, modo oscuro e intervalo horario del día.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  TextInput,
  Platform,
} from 'react-native';
import { usePreferences } from '../../contexts/PreferencesContext';
import type { FontSizeKey } from '../../contexts/PreferencesContext';
import { getDaySchedule, setDaySchedule, clearDaySchedule } from '../../services/dayScheduleService';
import { formatDateFull } from '../../utils/date';
import { scaledFontSize } from '../../utils/typography';
import {
  getAndroidAlarmWakeDiagnostics,
  openAndroidAppNotificationSettings,
  openAndroidAppDetailsSettings,
  openAndroidExactAlarmPermissionSettings,
  openAndroidManageFullScreenIntentSettings,
  resyncAllScheduledNotifications,
  type AndroidAlarmWakeDiagnostics,
} from '../../services/localNotificationService';

export type OptionsModalProps = {
  visible: boolean;
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

export function OptionsModal({ visible, onClose, selectedDate, onDayScheduleSaved }: OptionsModalProps) {
  const { preferences, setFontSize, setDarkMode, fontScale, colors } = usePreferences();
  const [dayStartHour, setDayStartHour] = useState('8');
  const [dayStartPm, setDayStartPm] = useState(false);
  const [dayEndHour, setDayEndHour] = useState('6');
  const [dayEndPm, setDayEndPm] = useState(true);

  useEffect(() => {
    if (visible && selectedDate) {
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
  }, [visible, selectedDate, preferences.scheduleStartHour, preferences.scheduleEndHour]);

  const [androidAlarmDiag, setAndroidAlarmDiag] = useState<AndroidAlarmWakeDiagnostics | null>(null);
  const [androidAlarmDiagLoading, setAndroidAlarmDiagLoading] = useState(false);

  const refreshAndroidAlarmDiagnostics = useCallback(async () => {
    if (Platform.OS !== 'android') return;
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
    if (!visible || Platform.OS !== 'android') return;
    void refreshAndroidAlarmDiagnostics();
  }, [visible, refreshAndroidAlarmDiagnostics]);

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

  if (!visible) return null;

  const baseFs = (n: number) => scaledFontSize(n, fontScale);

  const styles = StyleSheet.create({
    baseText: { fontFamily: 'PixelOperator', fontWeight: 'normal' as const },
    backdrop: {
      flex: 1,
      backgroundColor: colors.backdrop,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    card: {
      width: '100%',
      maxWidth: 360,
      maxHeight: '85%',
      backgroundColor: colors.cardBackground,
      borderRadius: 0,
      overflow: 'hidden',
    },
    header: {
      backgroundColor: colors.palmHeaderBg,
      paddingVertical: 14,
      paddingHorizontal: 16,
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: baseFs(18),
      color: colors.palmHeaderText,
      fontFamily: 'PixelOperator',
      fontWeight: 'normal',
    },
    scroll: { maxHeight: 560 },
    scrollContent: { padding: 18, paddingBottom: 12 },
    sectionTitle: {
      fontSize: baseFs(15),
      color: colors.text,
      marginBottom: 10,
      fontFamily: 'PixelOperator',
      fontWeight: 'normal',
    },
    fontRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 22,
    },
    fontBtn: {
      flex: 1,
      minWidth: 90,
      paddingVertical: 14,
      paddingHorizontal: 8,
      borderRadius: 0,
      backgroundColor: colors.barBackground,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fontBtnSelected: { backgroundColor: colors.daySelectedBg },
    fontBtnText: {
      fontSize: baseFs(14),
      color: colors.text,
      fontFamily: 'PixelOperator',
      fontWeight: 'normal',
    },
    fontBtnTextSelected: { color: colors.onAccentBg },
    darkModeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
      paddingVertical: 4,
    },
    darkModeLabel: {
      fontSize: baseFs(15),
      color: colors.text,
      fontFamily: 'PixelOperator',
      fontWeight: 'normal',
      flex: 1,
    },
    footer: {
      padding: 18,
      borderTopWidth: 1,
      borderColor: colors.line,
    },
    closeBtn: {
      paddingVertical: 12,
      borderRadius: 0,
      backgroundColor: colors.barBackground,
      alignItems: 'center',
    },
    closeBtnText: {
      fontSize: baseFs(15),
      color: colors.text,
      fontFamily: 'PixelOperator',
      fontWeight: 'normal',
    },
    dayScheduleLabel: {
      fontSize: baseFs(13),
      color: colors.textSecondary,
      marginBottom: 8,
      fontFamily: 'PixelOperator',
      fontWeight: 'normal',
    },
    dayScheduleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    dayScheduleInput: {
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 0,
      paddingHorizontal: 10,
      paddingVertical: 10,
      fontSize: baseFs(15),
      color: colors.text,
      fontFamily: 'PixelOperator',
      fontWeight: 'normal',
      minWidth: 44,
      textAlign: 'center',
    },
    ampmBtn: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 0,
      borderWidth: 1,
      borderColor: colors.line,
    },
    ampmBtnActive: { backgroundColor: colors.daySelectedBg, borderColor: colors.daySelectedBg },
    ampmBtnText: { fontSize: baseFs(13), color: colors.textSecondary, fontFamily: 'PixelOperator', fontWeight: 'normal' },
    ampmBtnTextActive: { color: colors.onAccentBg },
    dayScheduleBtn: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 0,
      backgroundColor: colors.daySelectedBg,
      marginTop: 4,
    },
    dayScheduleBtnSecondary: { backgroundColor: colors.barBackground },
    dayScheduleBtnText: { fontSize: baseFs(14), color: colors.onAccentBg, fontFamily: 'PixelOperator', fontWeight: 'normal' },
    dayScheduleBtnTextSecondary: { color: colors.text },
    androidBtn: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 0,
      backgroundColor: colors.barBackground,
      marginBottom: 8,
    },
    androidBtnText: { fontSize: baseFs(14), color: colors.text, fontFamily: 'PixelOperator', fontWeight: 'normal' },
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
    diagValAttention: {
      color: '#ca8a04',
    },
    diagValOk: {
      color: colors.daySelectedBg,
    },
  });

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Opciones</Text>
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={true}>
            <Text style={styles.sectionTitle}>Tamaño de letra</Text>
            <View style={styles.fontRow}>
              {FONT_OPTIONS.map(({ key, label }) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.fontBtn, preferences.fontSize === key && styles.fontBtnSelected]}
                  onPress={() => setFontSize(key)}
                >
                  <Text
                    style={[
                      styles.fontBtnText,
                      preferences.fontSize === key && styles.fontBtnTextSelected,
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Apariencia</Text>
            <View style={styles.darkModeRow}>
              <Text style={styles.darkModeLabel}>Modo oscuro</Text>
              <Switch
                value={preferences.darkMode}
                onValueChange={setDarkMode}
                trackColor={{ false: colors.line, true: colors.daySelectedBg }}
                thumbColor="#fff"
              />
            </View>

            {Platform.OS === 'android' && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Alarmas en Android</Text>
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
                            <Text style={[styles.diagVal]}>{trig}</Text>
                          </View>
                          <View style={styles.diagRow}>
                            <Text style={styles.diagKey}>Android API</Text>
                            <Text style={[styles.diagVal]}>{String(d.androidApiLevel)}</Text>
                          </View>
                        </>
                      );
                    })()}
                  </View>
                )}
                <TouchableOpacity
                  style={styles.androidBtn}
                  onPress={() => void refreshAndroidAlarmDiagnostics()}
                >
                  <Text style={styles.androidBtnText}>Actualizar estado de alarmas</Text>
                </TouchableOpacity>
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
              </>
            )}

            {selectedDate && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Intervalo del día</Text>
                <Text style={styles.dayScheduleLabel}>
                  Para el {formatDateFull(selectedDate)}
                </Text>
                <View style={styles.dayScheduleRow}>
                  <Text style={[styles.darkModeLabel, { minWidth: 44 }]}>Inicio</Text>
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
                  <Text style={[styles.darkModeLabel, { minWidth: 44 }]}>Fin</Text>
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
                <TouchableOpacity style={styles.dayScheduleBtn} onPress={handleSaveDaySchedule}>
                  <Text style={styles.dayScheduleBtnText}>Guardar intervalo para este día</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.dayScheduleBtn, styles.dayScheduleBtnSecondary]}
                  onPress={handleUseDefaultSchedule}
                >
                  <Text style={[styles.dayScheduleBtnText, styles.dayScheduleBtnTextSecondary]}>
                    Usar horario por defecto
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
          <View style={styles.footer}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
