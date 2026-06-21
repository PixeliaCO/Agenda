/**
 * Pantalla de alarma a pantalla completa (estilo Palm) cuando la app está en primer plano.
 * Sustituye el banner heads-up del sistema por una UI dedicada.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import type { Notification } from '@notifee/react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePreferences } from '../../contexts/PreferencesContext';
import { scaledFontSize, titleFont } from '../../utils/typography';
import { formatDisplayDate, formatTime12hShort } from '../../utils/date';

export type AlarmRingScreenProps = {
  notification: Notification;
  onComplete: () => void;
  onSnooze: () => void;
  onReschedule: () => void;
};

function readDataString(
  data: Record<string, unknown> | undefined,
  key: string,
): string {
  const v = data?.[key];
  return typeof v === 'string' ? v : '';
}

export function AlarmRingScreen({
  notification,
  onComplete,
  onSnooze,
  onReschedule,
}: AlarmRingScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors, fontScale, preferences } = usePreferences();
  const fs = (n: number) => scaledFontSize(n, fontScale);
  const footerBottomPad = Math.max(insets.bottom, 12) + 12;
  const data = notification.data as Record<string, unknown> | undefined;

  const title = notification.title?.trim() || readDataString(data, 'titleSnapshot') || 'Evento';
  const body = notification.body?.trim() || 'Alarma';
  const startTime = readDataString(data, 'startTimeSnapshot');
  const dateISO = readDataString(data, 'dateSnapshot');
  const timeChip = startTime ? formatTime12hShort(startTime) : '';
  const dateChip = dateISO ? formatDisplayDate(dateISO) : '';
  const snoozeLabel = `Recordar en ${preferences.alarmSnoozeMinutes} min`;

  const swipeStartY = React.useRef(0);

  const onScrollBeginDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    swipeStartY.current = e.nativeEvent.contentOffset.y;
  };

  const onScrollEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const delta = swipeStartY.current - e.nativeEvent.contentOffset.y;
    if (delta > 80) onComplete();
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: colors.viewScreenBackground },
        header: {
          backgroundColor: colors.agendaDateChipBg,
          paddingTop: Math.max(insets.top, 12) + 8,
          paddingBottom: 14,
          paddingHorizontal: 16,
          alignItems: 'center',
        },
        headerKicker: {
          color: colors.agendaDateChipText,
          fontSize: fs(12),
          opacity: 0.88,
          letterSpacing: 1,
          ...titleFont,
        },
        headerTitle: {
          color: colors.agendaDateChipText,
          fontSize: fs(19),
          marginTop: 4,
          textAlign: 'center',
          ...titleFont,
        },
        headerBar: {
          height: 3,
          backgroundColor: colors.agendaDateChipBg,
        },
        scroll: { flex: 1, flexShrink: 1, minHeight: 0 },
        scrollInner: {
          flexGrow: 1,
          paddingHorizontal: 16,
          paddingTop: 20,
          paddingBottom: 12,
        },
        card: {
          borderWidth: 2,
          borderColor: '#243B53',
          padding: 18,
          backgroundColor: colors.viewScreenBackground,
        },
        bodyText: {
          color: '#4A5F78',
          fontSize: fs(15),
          textAlign: 'center',
          lineHeight: fs(22),
        },
        chipRow: {
          flexDirection: 'row',
          justifyContent: 'center',
          marginTop: 16,
          gap: 8,
        },
        chip: {
          borderWidth: 1.5,
          borderColor: '#243B53',
          paddingHorizontal: 10,
          paddingVertical: 4,
        },
        chipText: {
          color: '#152238',
          fontSize: fs(13),
          ...titleFont,
        },
        divider: {
          height: 1,
          backgroundColor: '#C5D4E6',
          marginVertical: 12,
        },
        swipeHint: {
          color: '#6B7F95',
          fontSize: fs(13),
          textAlign: 'center',
          ...titleFont,
        },
        footer: {
          flexShrink: 0,
          backgroundColor: '#C3C3C3',
          paddingHorizontal: 12,
          paddingTop: 12,
          paddingBottom: footerBottomPad,
          borderTopWidth: 1,
          borderTopColor: '#888888',
        },
        row: {
          flexDirection: 'row',
          gap: 12,
          marginBottom: 10,
        },
        halfBtn: { flex: 1 },
        retroBtn: {
          borderWidth: 1.5,
          borderColor: '#888888',
          backgroundColor: '#C3C3C3',
          paddingVertical: 12,
          alignItems: 'center',
        },
        retroBtnText: {
          color: '#1A1A1A',
          fontSize: fs(14),
          ...titleFont,
        },
        doneBtn: {
          borderWidth: 1.5,
          borderColor: colors.agendaDateChipBg,
          backgroundColor: colors.agendaDateChipBg,
          paddingVertical: 14,
          alignItems: 'center',
        },
        doneBtnText: {
          color: colors.agendaDateChipText,
          fontSize: fs(15),
          ...titleFont,
        },
      }),
    [colors, fontScale, insets.top, footerBottomPad],
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerKicker}>ALARMA</Text>
        <Text style={styles.headerTitle} numberOfLines={2}>
          {title}
        </Text>
      </View>
      <View style={styles.headerBar} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollInner}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
      >
        <View style={styles.card}>
          <Text style={styles.bodyText}>{body}</Text>
          {(timeChip || dateChip) ? (
            <View style={styles.chipRow}>
              {timeChip ? (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>{timeChip}</Text>
                </View>
              ) : null}
              {dateChip ? (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>{dateChip}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={styles.divider} />
          <Text style={styles.swipeHint}>↑  Desliza hacia arriba para completar</Text>
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.retroBtn, styles.halfBtn]}
            onPress={onSnooze}
            accessibilityRole="button"
            accessibilityLabel={snoozeLabel}
          >
            <Text style={styles.retroBtnText}>{snoozeLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.retroBtn, styles.halfBtn]}
            onPress={onReschedule}
            accessibilityRole="button"
            accessibilityLabel="Reprogramar"
          >
            <Text style={styles.retroBtnText}>Reprogramar</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.doneBtn}
          onPress={onComplete}
          accessibilityRole="button"
          accessibilityLabel="Completado"
        >
          <Text style={styles.doneBtnText}>Completado</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
