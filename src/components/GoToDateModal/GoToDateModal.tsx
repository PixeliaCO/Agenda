/**
 * Modal "Ir a fecha": selector de año, mes y día.
 * Al elegir un día se navega a la vista del día con esa fecha.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { usePreferences } from '../../contexts/PreferencesContext';
import { getMonthCalendarCells, getTodayISO } from '../../utils/date';
import { WEEK_DAY_LETTERS } from '../../constants/agenda';
import { scaledFontSize } from '../../utils/typography';
import type { Reminder } from '../../types/reminder';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export type GoToDateModalProps = {
  visible: boolean;
  /** Título de la cabecera (por defecto «Ir a fecha») */
  title?: string;
  /** Fecha inicial al abrir (ej. fecha actual o seleccionada) */
  initialDate?: string;
  /** Recordatorios del mes mostrado (opcional, para marcar días con eventos) */
  reminders?: Reminder[];
  /** Al cambiar de mes en el calendario (para que el padre cargue recordatorios) */
  onMonthChange?: (year: number, month: number) => void;
  /** Al elegir una fecha: pasa YYYY-MM-DD y cierra el modal */
  onSelectDate: (dateISO: string) => void;
  onClose: () => void;
};

export function GoToDateModal({
  visible,
  title = 'Ir a fecha',
  initialDate,
  reminders = [],
  onMonthChange,
  onSelectDate,
  onClose,
}: GoToDateModalProps) {
  const today = getTodayISO();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    if (visible && initialDate) {
      const [y, m] = initialDate.split('-').map(Number);
      setYear(y);
      setMonth(m - 1);
      setSelectedDay(initialDate);
      onMonthChange?.(y, m - 1);
    } else if (visible) {
      const d = new Date();
      setYear(d.getFullYear());
      setMonth(d.getMonth());
      setSelectedDay(today);
      onMonthChange?.(d.getFullYear(), d.getMonth());
    }
  }, [visible, initialDate]);

  const handleYearChange = (delta: number) => {
    const next = year + delta;
    setYear(next);
    onMonthChange?.(next, month);
  };
  const handleMonthChange = (m: number) => {
    setMonth(m);
    onMonthChange?.(year, m);
  };

  const monthAnchor = new Date(year, month, 1);
  const cells = getMonthCalendarCells(monthAnchor);
  const datesWithEvents = new Set(reminders.map((r) => r.date));

  const handleDayPress = (dateISO: string | null) => {
    if (dateISO == null) return;
    onSelectDate(dateISO);
    onClose();
  };

  const handleHoy = () => {
    onSelectDate(today);
    onClose();
  };

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
        },
        card: {
          width: '100%',
          maxWidth: 360,
          backgroundColor: colors.cardBackground,
          borderRadius: 0,
          overflow: 'hidden',
          paddingBottom: 16,
        },
        header: {
          backgroundColor: colors.palmHeaderBg,
          paddingVertical: 12,
          alignItems: 'center',
        },
        headerTitle: { fontSize: fs(18), color: colors.palmHeaderText, fontFamily: 'PixelOperator', fontWeight: 'normal' },
        yearRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          paddingVertical: 12,
        },
        yearArrow: { padding: 4 },
        yearArrowText: { fontSize: fs(16), color: colors.iconActive, fontFamily: 'PixelOperator', fontWeight: 'normal' },
        yearText: {
          fontSize: fs(20),
          color: colors.text,
          minWidth: 48,
          textAlign: 'center',
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
        },
        monthGrid: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 6,
          paddingHorizontal: 12,
          paddingBottom: 12,
        },
        monthBtn: {
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 0,
          backgroundColor: colors.barBackground,
          minWidth: 48,
          alignItems: 'center',
        },
        monthBtnSelected: { backgroundColor: colors.daySelectedBg },
        monthBtnText: { fontSize: fs(13), color: colors.text, fontFamily: 'PixelOperator', fontWeight: 'normal' },
        monthBtnTextSelected: { color: colors.onAccentBg },
        dayHeaderRow: {
          flexDirection: 'row',
          paddingHorizontal: 8,
          paddingBottom: 4,
          borderBottomWidth: 1,
          borderColor: colors.line,
          marginHorizontal: 12,
        },
        dayHeaderCell: { flex: 1, alignItems: 'center' },
        dayHeaderText: {
          fontSize: fs(8),
          lineHeight: Math.round(fs(8) * 1.12),
          color: colors.textSecondary,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
          textAlign: 'center',
        },
        calendarGrid: { paddingHorizontal: 8, paddingTop: 8, marginHorizontal: 12 },
        calendarRow: { flexDirection: 'row', marginBottom: 4 },
        dayCell: {
          flex: 1,
          aspectRatio: 1,
          maxHeight: 40,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 0,
          marginHorizontal: 2,
        },
        dayCellOther: { opacity: 0.35 },
        dayCellToday: {
          backgroundColor: colors.todayCellBg,
          borderWidth: 1,
          borderColor: colors.reminderAlt1,
        },
        dayCellSelected: { backgroundColor: colors.daySelectedBg },
        dayCellText: { fontSize: fs(14), color: colors.text, fontFamily: 'PixelOperator', fontWeight: 'normal' },
        dayCellTextOther: { color: colors.textSecondary },
        dayCellTextSelected: { color: colors.onAccentBg },
        dayDot: {
          position: 'absolute',
          bottom: 2,
          width: 4,
          height: 4,
          borderRadius: 0,
          backgroundColor: colors.reminderDefault,
        },
        actions: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: 16,
          gap: 12,
        },
        btnCancel: {
          flex: 1,
          paddingVertical: 12,
          borderRadius: 0,
          backgroundColor: colors.barBackground,
          alignItems: 'center',
        },
        btnCancelText: { fontSize: fs(15), color: colors.text, fontFamily: 'PixelOperator', fontWeight: 'normal' },
        btnHoy: {
          flex: 1,
          paddingVertical: 12,
          borderRadius: 0,
          backgroundColor: colors.daySelectedBg,
          alignItems: 'center',
        },
        btnHoyText: { fontSize: fs(15), color: colors.onAccentBg, fontFamily: 'PixelOperator', fontWeight: 'normal' },
      }),
    [colors, fontScale]
  );

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{title}</Text>
          </View>

          <View style={styles.yearRow}>
            <TouchableOpacity onPress={() => handleYearChange(-1)} style={styles.yearArrow} hitSlop={8}>
              <Text style={styles.yearArrowText}>{'◀'}</Text>
            </TouchableOpacity>
            <Text style={styles.yearText}>{year}</Text>
            <TouchableOpacity onPress={() => handleYearChange(1)} style={styles.yearArrow} hitSlop={8}>
              <Text style={styles.yearArrowText}>{'▶'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.monthGrid}>
            {MONTHS.map((label, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.monthBtn, i === month && styles.monthBtnSelected]}
                onPress={() => handleMonthChange(i)}
              >
                <Text style={[styles.monthBtnText, i === month && styles.monthBtnTextSelected]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.dayHeaderRow}>
            {WEEK_DAY_LETTERS.map((letter, i) => (
              <View key={i} style={styles.dayHeaderCell}>
                <Text style={styles.dayHeaderText} numberOfLines={3}>
                  {letter}
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
                  const isSelected = dateISO === selectedDay;
                  const hasEvents = dateISO !== null && datesWithEvents.has(dateISO);
                  const index = row * 7 + col;
                  return (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.dayCell,
                        !isCurrentMonth && styles.dayCellOther,
                        isToday && styles.dayCellToday,
                        isSelected && styles.dayCellSelected,
                      ]}
                      onPress={() => {
                        if (dateISO) setSelectedDay(dateISO);
                        handleDayPress(dateISO);
                      }}
                      disabled={!isCurrentMonth}
                    >
                      {dateISO != null ? (
                        <>
                          <Text
                            style={[
                              styles.dayCellText,
                              !isCurrentMonth && styles.dayCellTextOther,
                              isSelected && styles.dayCellTextSelected,
                            ]}
                          >
                            {parseInt(dateISO.slice(8, 10), 10)}
                          </Text>
                          {hasEvents && <View style={styles.dayDot} />}
                        </>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.btnCancel} onPress={onClose}>
              <Text style={styles.btnCancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnHoy} onPress={handleHoy}>
              <Text style={styles.btnHoyText}>Hoy</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
