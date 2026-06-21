/**
 * Vista resumen del día: lista cronológica de eventos (hora + título).
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { usePreferences } from '../../contexts/PreferencesContext';
import { formatTime12hShort } from '../../utils/date';
import { scaledFontSize, titleFont } from '../../utils/typography';
import type { Reminder } from '../../types/reminder';
import { EventTitleWithIcons } from '../EventTitleWithIcons';

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

export type DaySummaryViewProps = {
  reminders: Reminder[];
  onReminderPress?: (reminder: Reminder) => void;
};

export function DaySummaryView({ reminders, onReminderPress }: DaySummaryViewProps) {
  const { colors, fontScale } = usePreferences();

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
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.screenBackground },
        scroll: { flex: 1 },
        scrollContent: { paddingVertical: 4, paddingHorizontal: 0, paddingBottom: 28 },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 10 + Math.round((fontScale - 1) * 4),
          paddingHorizontal: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderColor: colors.line,
          gap: 14,
        },
        rowPressed: { backgroundColor: colors.pressedBg },
        time: {
          fontSize: fs(13),
          color: colors.textSecondary,
          minWidth: Math.max(44, Math.round(44 * fontScale)),
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
        },
        title: { fontSize: fs(14), color: colors.text, ...titleFont },
        titleWrap: { flex: 1, minWidth: 0 },
        empty: {
          fontSize: fs(14),
          color: colors.textSecondary,
          textAlign: 'center',
          marginTop: 24,
          paddingHorizontal: 18,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
        },
      }),
    [colors, fontScale]
  );

  return (
    <View style={styles.container}>
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
                  iconSize={Math.max(18, Math.round(fs(14) * 1.2))}
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
