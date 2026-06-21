/**
 * Vista de mes: calendario con cuadrícula de días.
 * Al presionar un día se navega a la vista del día (onDayPress).
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { WEEK_DAY_LETTERS } from '../../constants/agenda';
import { usePreferences } from '../../contexts/PreferencesContext';
import { formatMonthYearLong, getMonthCalendarCells, getTodayISO } from '../../utils/date';
import { scaledFontSize } from '../../utils/typography';
import type { Reminder } from '../../types/reminder';

export type MonthViewProps = {
  monthAnchor: Date;
  reminders?: Reminder[];
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onDayPress: (dateISO: string) => void;
};

export function MonthView({
  monthAnchor,
  reminders = [],
  onPreviousMonth,
  onNextMonth,
  onDayPress,
}: MonthViewProps) {
  const { colors, fontScale } = usePreferences();
  const cells = getMonthCalendarCells(monthAnchor);
  const today = getTodayISO();
  const reminderDates = new Set(reminders.map((r) => r.date));
  const fs = (n: number) => scaledFontSize(n, fontScale);
  const pad = (base: number) => base + Math.round((fontScale - 1) * 6);
  const cellMinH = Math.max(44, Math.round(44 * fontScale));
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.screenBackground,
          paddingHorizontal: 14,
          paddingTop: pad(8),
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: pad(12),
          paddingHorizontal: 6,
        },
        monthYear: { fontSize: fs(18), color: colors.text, fontFamily: 'PixelOperator', fontWeight: 'normal' },
        nav: { flexDirection: 'row', alignItems: 'center', gap: 10 },
        arrow: { padding: 6 },
        arrowText: { fontSize: fs(20), color: colors.iconActive, fontFamily: 'PixelOperator', fontWeight: 'normal' },
        dayHeaders: {
          flexDirection: 'row',
          borderBottomWidth: 1,
          borderColor: colors.line,
          paddingBottom: 10,
          paddingTop: 4,
          marginBottom: 6,
          minHeight: Math.round(fs(9) * 2.4),
        },
        dayHeaderCell: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 1 },
        dayHeaderText: {
          fontSize: fs(9),
          lineHeight: Math.round(fs(9) * 1.2),
          color: colors.textSecondary,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
          textAlign: 'center',
        },
        grid: { flex: 1 },
        gridRow: { flexDirection: 'row', flex: 1, minHeight: cellMinH },
        cell: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          margin: 2,
          borderRadius: 0,
          backgroundColor: colors.cardBackground,
          borderWidth: 1,
          borderColor: 'transparent',
        },
        cellOtherMonth: { backgroundColor: 'transparent', opacity: 0.4 },
        cellToday: {
          borderColor: colors.daySelectedBg,
          borderWidth: 2,
          backgroundColor: colors.todayCellBg,
        },
        cellDay: { fontSize: fs(15), color: colors.text, fontFamily: 'PixelOperator', fontWeight: 'normal' },
        cellDayOther: { color: colors.textSecondary },
        dot: {
          position: 'absolute',
          bottom: 4,
          width: 5,
          height: 5,
          borderRadius: 0,
          backgroundColor: colors.reminderDefault,
        },
      }),
    [colors, fontScale]
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.monthYear}>{formatMonthYearLong(monthAnchor)}</Text>
        <View style={styles.nav}>
          <TouchableOpacity onPress={onPreviousMonth} style={styles.arrow} hitSlop={12}>
            <Text style={styles.arrowText}>{'<'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onNextMonth} style={styles.arrow} hitSlop={12}>
            <Text style={styles.arrowText}>{'>'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.dayHeaders}>
        {WEEK_DAY_LETTERS.map((dayName, i) => (
          <View key={i} style={styles.dayHeaderCell}>
            <Text style={styles.dayHeaderText} numberOfLines={2}>
              {dayName}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <View key={row} style={styles.gridRow}>
            {cells.slice(row * 7, (row + 1) * 7).map((dateISO, col) => {
              const isCurrentMonth = dateISO !== null;
              const isToday = dateISO === today;
              const hasReminders = dateISO !== null && reminderDates.has(dateISO);
              const index = row * 7 + col;
              return (
                <Pressable
                  key={index}
                  style={[
                    styles.cell,
                    !isCurrentMonth && styles.cellOtherMonth,
                    isToday && styles.cellToday,
                  ]}
                  onPress={() => dateISO != null && onDayPress(dateISO)}
                  disabled={!isCurrentMonth}
                >
                  {dateISO != null ? (
                    <>
                      <Text style={[styles.cellDay, !isCurrentMonth && styles.cellDayOther]}>
                        {parseInt(dateISO.slice(8, 10), 10)}
                      </Text>
                      {hasReminders && <View style={styles.dot} />}
                    </>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}
