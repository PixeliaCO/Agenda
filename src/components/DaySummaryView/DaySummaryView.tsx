/**
 * Vista resumen del día: lista cronológica de eventos (hora + título).
 */

import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView } from 'react-native';
import { usePreferences } from '../../contexts/PreferencesContext';
import { formatTime12hShort, formatDateWithWeekday, formatTime12h } from '../../utils/date';
import { scaledFontSize } from '../../utils/typography';
import type { Reminder } from '../../types/reminder';
import { EventTitleWithIcons } from '../EventTitleWithIcons';

function nowToTime24(): string {
  const d = new Date();
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h < 10 ? '0' + h : h}:${m < 10 ? '0' + m : m}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

export type DaySummaryViewProps = {
  dateISO: string;
  reminders: Reminder[];
  onPreviousDay: () => void;
  onNextDay: () => void;
  onReminderPress?: (reminder: Reminder) => void;
};

export function DaySummaryView({
  dateISO,
  reminders,
  onPreviousDay,
  onNextDay,
  onReminderPress,
}: DaySummaryViewProps) {
  const { colors, fontScale } = usePreferences();
  const [now, setNow] = useState(() => nowToTime24());
  useEffect(() => {
    const id = setInterval(() => setNow(nowToTime24()), 60000);
    return () => clearInterval(id);
  }, []);
  const currentTimeStr = formatTime12h(now);

  const sorted = useMemo(
    () =>
      [...reminders].sort((a, b) => {
        if (a.noTime !== b.noTime) return a.noTime ? -1 : 1;
        const t = timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
        if (t !== 0) return t;
        return a.id.localeCompare(b.id);
      }),
    [reminders]
  );

  const fs = (n: number) => scaledFontSize(n, fontScale);
  const pad = 10 + Math.round((fontScale - 1) * 4);
  const arrowMin = 40;
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.screenBackground },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingVertical: pad,
          borderBottomWidth: 1,
          borderColor: colors.line,
          backgroundColor: colors.barBackground,
          minHeight: 48,
        },
        currentTime: {
          fontSize: fs(13),
          color: colors.iconActive,
          maxWidth: '28%',
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
        },
        dateNav: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          minWidth: 0,
          gap: 6,
        },
        arrow: {
          minWidth: arrowMin,
          minHeight: arrowMin,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 6,
        },
        arrowText: { fontSize: fs(20), color: colors.iconActive, fontFamily: 'PixelOperator', fontWeight: 'normal' },
        dateLabel: {
          flex: 1,
          fontSize: fs(15),
          color: colors.text,
          minWidth: 0,
          textAlign: 'center',
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
        },
        scroll: { flex: 1 },
        scrollContent: { paddingVertical: 10, paddingHorizontal: 18, paddingBottom: 28 },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 12 + Math.round((fontScale - 1) * 4),
          paddingHorizontal: 8,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderColor: colors.line,
          gap: 14,
        },
        rowPressed: { backgroundColor: colors.pressedBg },
        time: {
          fontSize: fs(15),
          color: colors.text,
          minWidth: Math.max(44, Math.round(44 * fontScale)),
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
        },
        title: { fontSize: fs(16), color: colors.text, fontFamily: 'PixelOperator', fontWeight: 'normal' },
        titleWrap: { flex: 1, minWidth: 0 },
        empty: {
          fontSize: fs(15),
          color: colors.textSecondary,
          textAlign: 'center',
          marginTop: 24,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
        },
      }),
    [colors, fontScale]
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.currentTime} numberOfLines={1} ellipsizeMode="tail">
          {currentTimeStr}
        </Text>
        <View style={styles.dateNav}>
          <TouchableOpacity onPress={onPreviousDay} style={styles.arrow} hitSlop={8}>
            <Text style={styles.arrowText}>{'<'}</Text>
          </TouchableOpacity>
          <Text style={styles.dateLabel} numberOfLines={1} ellipsizeMode="tail">
            {formatDateWithWeekday(dateISO)}
          </Text>
          <TouchableOpacity onPress={onNextDay} style={styles.arrow} hitSlop={8}>
            <Text style={styles.arrowText}>{'>'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {sorted.length === 0 ? (
          <Text style={styles.empty}>Sin eventos para este día</Text>
        ) : (
          sorted.map((r) => (
            <Pressable
              key={r.id}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => onReminderPress?.(r)}
            >
              <Text style={styles.time}>
                {r.noTime
                  ? '—'
                  : r.allDay && r.endTime && r.startTime !== r.endTime
                    ? `${formatTime12hShort(r.startTime)}–${formatTime12hShort(r.endTime)}`
                    : formatTime12hShort(r.startTime)}
              </Text>
              <View style={styles.titleWrap}>
                <EventTitleWithIcons
                  title={r.title}
                  showAlarm={Boolean(r.alarm && !r.noTime)}
                  showNote={Boolean(r.note?.trim())}
                  textStyle={styles.title}
                  iconSize={Math.max(18, Math.round(fs(16) * 1.2))}
                  numberOfLines={1}
                />
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}
