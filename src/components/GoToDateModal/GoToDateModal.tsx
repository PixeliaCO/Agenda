/**
 * Pantalla «Ir a fecha»: selector de año, mes y día (estilo Palm Datebook).
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { usePreferences } from "../../contexts/PreferencesContext";
import {
  getMonthCalendarCellsMondayFirst,
  getTodayISO,
} from "../../utils/date";
import { SINGLE_DAY_LETTERS } from "../../constants/agenda";
import { scaledFontSize, titleFont } from "../../utils/typography";
import { PalmScreenShell } from "../PalmScreenShell";
import type { Reminder } from "../../types/reminder";

const MONTHS = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

export type GoToDateScreenProps = {
  /** Título de la cabecera (por defecto «Ir a fecha») */
  title?: string;
  /** Fecha inicial al abrir (ej. fecha actual o seleccionada) */
  initialDate?: string;
  /** Recordatorios del mes mostrado (opcional, para marcar días con eventos) */
  reminders?: Reminder[];
  /** Al cambiar de mes en el calendario (para que el padre cargue recordatorios) */
  onMonthChange?: (year: number, month: number) => void;
  /** Al elegir una fecha: pasa YYYY-MM-DD y cierra */
  onSelectDate: (dateISO: string) => void;
  onClose: () => void;
};

export function GoToDateScreen({
  title = "Ir a fecha",
  initialDate,
  reminders = [],
  onMonthChange,
  onSelectDate,
  onClose,
}: GoToDateScreenProps) {
  const today = getTodayISO();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    if (initialDate) {
      const [y, m] = initialDate.split("-").map(Number);
      setYear(y);
      setMonth(m - 1);
      setSelectedDay(initialDate);
      onMonthChange?.(y, m - 1);
    } else {
      const d = new Date();
      setYear(d.getFullYear());
      setMonth(d.getMonth());
      setSelectedDay(getTodayISO());
      onMonthChange?.(d.getFullYear(), d.getMonth());
    }
  }, []);

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
  const cells = getMonthCalendarCellsMondayFirst(monthAnchor);
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
        scrollContent: { padding: 10, paddingBottom: 16 },
        calendarFrame: {
          backgroundColor: colors.viewScreenBackground,
        },
        yearRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          paddingVertical: 10,
          backgroundColor: colors.viewScreenBackground,
        },
        yearArrow: { padding: 4 },
        yearArrowText: {
          fontSize: fs(14),
          color: colors.text,
          fontFamily: "PixelOperator",
          fontWeight: "normal",
        },
        yearText: {
          fontSize: fs(18),
          color: colors.text,
          minWidth: 52,
          textAlign: "center",
          fontFamily: "PixelOperator",
          fontWeight: "normal",
        },
        monthGrid: {
          borderWidth: 1,
          borderColor: colors.agendaHeaderBorder,
        },
        monthRow: {
          flexDirection: "row",
        },
        monthCell: {
          flex: 1,
          paddingVertical: 7,
          alignItems: "center",
          justifyContent: "center",
          borderRightWidth: 1,
          borderBottomWidth: 1,
          borderColor: colors.agendaHeaderBorder,
          backgroundColor: colors.viewScreenBackground,
        },
        monthCellLast: { borderRightWidth: 0 },
        monthCellLastRow: { borderBottomWidth: 0 },
        monthCellSelected: { backgroundColor: colors.agendaHeaderSelectedBg },
        monthCellText: {
          fontSize: fs(13),
          color: colors.text,
          fontFamily: "PixelOperator",
          fontWeight: "normal",
        },
        monthCellTextSelected: { color: colors.agendaHeaderSelectedText },
        dayHeaderRow: {
          flexDirection: "row",
          marginTop: 10,
          backgroundColor: colors.viewScreenBackground,
        },
        dayHeaderCell: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: 4,
        },
        dayHeaderText: {
          fontSize: fs(10),
          color: colors.text,
          ...titleFont,
          textAlign: "center",
        },
        calendarGrid: {
          paddingVertical: 6,
          paddingHorizontal: 2,
          backgroundColor: colors.viewScreenBackground,
        },
        calendarRow: { flexDirection: "row", marginBottom: 2 },
        dayCell: {
          flex: 1,
          aspectRatio: 1,
          maxHeight: 40,
          alignItems: "center",
          justifyContent: "center",
        },
        dayCellSelected: { backgroundColor: colors.agendaHeaderSelectedBg },
        dayCellText: {
          fontSize: fs(14),
          color: colors.text,
          fontFamily: "PixelOperator",
          fontWeight: "normal",
        },
        dayCellTextSelected: { color: colors.agendaHeaderSelectedText },
        dayDot: {
          position: "absolute",
          bottom: 4,
          width: 4,
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.reminderDefault,
        },
        actions: {
          flexDirection: "row",
          justifyContent: "space-between",
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
          alignItems: "center",
        },
        footerBtnText: {
          fontSize: fs(15),
          color: colors.footerText,
          fontFamily: "PixelOperator",
          fontWeight: "normal",
        },
      }),
    [colors, fontScale],
  );

  const footer = (
    <View style={styles.actions}>
      <TouchableOpacity style={styles.footerBtn} onPress={onClose}>
        <Text style={styles.footerBtnText}>Cancelar</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.footerBtn} onPress={handleHoy}>
        <Text style={styles.footerBtnText}>Hoy</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <PalmScreenShell title={title} onClose={onClose} footer={footer}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.calendarFrame}>
          <View style={styles.yearRow}>
            <TouchableOpacity
              onPress={() => handleYearChange(-1)}
              style={styles.yearArrow}
              hitSlop={8}
            >
              <Text style={styles.yearArrowText}>{"◀"}</Text>
            </TouchableOpacity>
            <Text style={styles.yearText}>{year}</Text>
            <TouchableOpacity
              onPress={() => handleYearChange(1)}
              style={styles.yearArrow}
              hitSlop={8}
            >
              <Text style={styles.yearArrowText}>{"▶"}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.monthGrid}>
            {[0, 1].map((row) => (
              <View key={row} style={styles.monthRow}>
                {MONTHS.slice(row * 6, row * 6 + 6).map((label, col) => {
                  const i = row * 6 + col;
                  const selected = i === month;
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[
                        styles.monthCell,
                        col === 5 && styles.monthCellLast,
                        row === 1 && styles.monthCellLastRow,
                        selected && styles.monthCellSelected,
                      ]}
                      onPress={() => handleMonthChange(i)}
                    >
                      <Text
                        style={[
                          styles.monthCellText,
                          selected && styles.monthCellTextSelected,
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>

          <View style={styles.dayHeaderRow}>
            {SINGLE_DAY_LETTERS.map((dayName, i) => (
              <View key={i} style={styles.dayHeaderCell}>
                <Text
                  style={styles.dayHeaderText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
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
                  const isSelected = dateISO === selectedDay;
                  const hasEvents =
                    dateISO !== null && datesWithEvents.has(dateISO);
                  const index = row * 7 + col;
                  return (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.dayCell,
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
        </View>
      </ScrollView>
    </PalmScreenShell>
  );
}

/** @deprecated Usar GoToDateScreen */
export type GoToDateModalProps = GoToDateScreenProps & { visible?: boolean };

/** @deprecated Usar GoToDateScreen con ScreenOverlay en el padre */
export function GoToDateModal(props: GoToDateModalProps) {
  const { visible = true, ...rest } = props;
  if (!visible) return null;
  return <GoToDateScreen {...rest} />;
}
