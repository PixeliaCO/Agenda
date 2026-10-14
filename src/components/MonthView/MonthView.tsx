/**
 * Vista de mes: calendario con cuadrícula de días.
 * Al presionar un día se selecciona (onDayPress) y debajo se muestra el resumen de sus citas.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { WEEK_DAY_LETTERS } from '../../constants/agenda';
import { usePreferences } from '../../contexts/PreferencesContext';
import { getColombianHolidays } from '../../utils/colombianHolidays';
import { formatDateWithWeekday, getMonthCalendarCells } from '../../utils/date';
import { scaledFontSize, titleFont } from '../../utils/typography';
import type { Reminder } from '../../types/reminder';
import { DaySummaryView } from '../DaySummaryView';

export type MonthViewProps = {
  monthAnchor: Date;
  reminders?: Reminder[];
  /** Día seleccionado (YYYY-MM-DD): se resalta su número y se listan sus citas. */
  selectedDate: string;
  /** Citas del día seleccionado para el resumen inferior. */
  selectedDayReminders?: Reminder[];
  onDayPress: (dateISO: string) => void;
  onReminderPress?: (reminder: Reminder) => void;
};

export function MonthView({
  monthAnchor,
  reminders = [],
  selectedDate,
  selectedDayReminders = [],
  onDayPress,
  onReminderPress,
}: MonthViewProps) {
  const { colors, fontScale } = usePreferences();
  const cells = getMonthCalendarCells(monthAnchor);
  const reminderDates = new Set(reminders.map((r) => r.date));
  const holidays = getColombianHolidays(monthAnchor.getFullYear());
  const fs = (n: number) => scaledFontSize(n, fontScale);
  const cellMinH = Math.max(48, Math.round(48 * fontScale));
  const stripeH = Math.max(5, Math.round(5 * fontScale));
  const stripeGap = 3;
  const dotSize = Math.max(8, Math.round(8 * fontScale));
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
          flex: 3,
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
        /** Envuelve siempre el número para que la casilla mida igual esté o no seleccionada. */
        dayNumberBadge: {
          minWidth: Math.round(fs(14) * 1.5),
          paddingHorizontal: 3,
          borderRadius: 4,
          alignItems: 'center',
          justifyContent: 'center',
        },
        dayNumberBadgeSelected: { backgroundColor: colors.agendaHeaderSelectedBg },
        dayCellTextSelected: { color: colors.agendaHeaderSelectedText },
        dayCellText: {
          fontSize: fs(14),
          color: colors.text,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
        },
        dayCellTextOther: { color: colors.textSecondary },
        dayCellTextSunday: { color: colors.sundayText },
        /** Alto reservado siempre (haya festivo o no) para que el número no cambie de altura entre casillas. */
        holidayStripes: {
          alignSelf: 'stretch',
          height: stripeH * 2 + stripeGap,
          marginTop: 2,
          justifyContent: 'space-between',
        },
        holidayStripe: {
          alignSelf: 'stretch',
          height: stripeH,
          backgroundColor: colors.holidayStripe,
        },
        /** Mismo flex que dotSlot: mantiene número y franjas centrados en la casilla. */
        topSpacer: { flex: 1 },
        /** Zona inferior de la casilla; el punto queda centrado en ella. */
        dotSlot: {
          flex: 1,
          alignSelf: 'stretch',
          alignItems: 'center',
          justifyContent: 'center',
        },
        dayDot: {
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          backgroundColor: colors.agendaHeaderSelectedBg,
        },
        summary: { flex: 2, marginTop: 8 },
        summaryHeader: {
          paddingHorizontal: 12,
          paddingVertical: 4,
          borderBottomWidth: 1,
          borderColor: colors.agendaHeaderBorder,
        },
        summaryHeaderText: {
          fontSize: fs(12),
          color: colors.agendaHeaderText,
          ...titleFont,
        },
      }),
    [colors, fontScale, cellMinH, stripeH, dotSize]
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
                const isSelected = dateISO !== null && dateISO === selectedDate;
                const hasReminders = dateISO !== null && reminderDates.has(dateISO);
                const isHoliday = dateISO !== null && holidays.has(dateISO);
                const isSunday = col === 0;
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
                    ]}
                    onPress={() => dateISO != null && onDayPress(dateISO)}
                    disabled={!isCurrentMonth}
                  >
                    {dateISO != null ? (
                      <>
                        <View style={styles.topSpacer} />
                        <View style={[styles.dayNumberBadge, isSelected && styles.dayNumberBadgeSelected]}>
                          <Text
                            style={[
                              styles.dayCellText,
                              !isCurrentMonth && styles.dayCellTextOther,
                              isSunday && styles.dayCellTextSunday,
                              isSelected && styles.dayCellTextSelected,
                            ]}
                          >
                            {parseInt(dateISO.slice(8, 10), 10)}
                          </Text>
                        </View>
                        <View style={styles.holidayStripes}>
                          {isHoliday && (
                            <>
                              <View style={styles.holidayStripe} />
                              <View style={styles.holidayStripe} />
                            </>
                          )}
                        </View>
                        <View style={styles.dotSlot}>
                          {hasReminders && <View style={styles.dayDot} />}
                        </View>
                      </>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        <View style={styles.summary}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryHeaderText} numberOfLines={1}>
              {formatDateWithWeekday(selectedDate)}
            </Text>
          </View>
          <DaySummaryView reminders={selectedDayReminders} onReminderPress={onReminderPress} />
        </View>
      </View>
    </View>
  );
}
