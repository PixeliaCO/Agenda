/**
 * Vista de mes: calendario con cuadrícula de días.
 * Al presionar un día se navega a la vista del día (onDayPress).
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { WEEK_DAY_LETTERS } from '../../constants/agenda';
import { usePreferences } from '../../contexts/PreferencesContext';
import { getMonthCalendarCells, getTodayISO } from '../../utils/date';
import { scaledFontSize, titleFont } from '../../utils/typography';
import type { Reminder } from '../../types/reminder';

export type MonthViewProps = {
  monthAnchor: Date;
  reminders?: Reminder[];
  onDayPress: (dateISO: string) => void;
};

export function MonthView({
  monthAnchor,
  reminders = [],
  onDayPress,
}: MonthViewProps) {
  const { colors, fontScale } = usePreferences();
  const cells = getMonthCalendarCells(monthAnchor);
  const today = getTodayISO();
  const reminderDates = new Set(reminders.map((r) => r.date));
  const fs = (n: number) => scaledFontSize(n, fontScale);
  const cellMinH = Math.max(40, Math.round(40 * fontScale));
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.screenBackground,
        },
        body: {
          flex: 1,
          paddingHorizontal: 8,
          paddingTop: 8,
          paddingBottom: 8,
        },
        dayHeaderRow: {
          flexDirection: 'row',
          marginBottom: 0,
          backgroundColor: colors.screenBackground,
        },
        dayHeaderCell: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 4,
        },
        dayHeaderText: {
          fontSize: fs(10),
          color: colors.agendaHeaderText,
          ...titleFont,
          textAlign: 'center',
        },
        calendarGrid: {
          flex: 1,
          borderWidth: 1,
          borderColor: colors.agendaHeaderBorder,
        },
        calendarRow: { flexDirection: 'row', flex: 1, minHeight: cellMinH },
        dayCell: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          borderRightWidth: 1,
          borderBottomWidth: 1,
          borderColor: colors.agendaHeaderBorder,
          backgroundColor: colors.screenBackground,
        },
        dayCellLastCol: { borderRightWidth: 0 },
        dayCellLastRow: { borderBottomWidth: 0 },
        dayCellOtherMonth: { opacity: 0.35 },
        dayCellToday: {
          backgroundColor: colors.todayCellBg,
          borderWidth: 2,
          borderColor: colors.agendaHeaderSelectedBg,
        },
        dayCellText: {
          fontSize: fs(14),
          color: colors.text,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
        },
        dayCellTextOther: { color: colors.textSecondary },
        dayDot: {
          position: 'absolute',
          bottom: 4,
          width: 4,
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.reminderDefault,
        },
      }),
    [colors, fontScale, cellMinH]
  );

  return (
    <View style={styles.container}>
      <View style={styles.body}>
        <View style={styles.dayHeaderRow}>
          {WEEK_DAY_LETTERS.map((dayName, i) => (
            <View key={i} style={styles.dayHeaderCell}>
              <Text style={styles.dayHeaderText} numberOfLines={2}>
                {dayName}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.calendarGrid}>
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <View key={row} style={styles.calendarRow}>
              {cells.slice(row * 7, (row + 1) * 7).map((dateISO, col) => {
                const isCurrentMonth = dateISO !== null;
                const isToday = dateISO === today;
                const hasReminders = dateISO !== null && reminderDates.has(dateISO);
                const index = row * 7 + col;
                const isLastCol = col === 6;
                const isLastRow = row === 5;
                return (
                  <Pressable
                    key={index}
                    style={[
                      styles.dayCell,
                      isLastCol && styles.dayCellLastCol,
                      isLastRow && styles.dayCellLastRow,
                      !isCurrentMonth && styles.dayCellOtherMonth,
                      isToday && styles.dayCellToday,
                    ]}
                    onPress={() => dateISO != null && onDayPress(dateISO)}
                    disabled={!isCurrentMonth}
                  >
                    {dateISO != null ? (
                      <>
                        <Text style={[styles.dayCellText, !isCurrentMonth && styles.dayCellTextOther]}>
                          {parseInt(dateISO.slice(8, 10), 10)}
                        </Text>
                        {hasReminders && <View style={styles.dayDot} />}
                      </>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
