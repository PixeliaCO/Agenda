/**
 * Cabecera de la pantalla de agenda (estilo Palm Datebook).
 * Fila 1: ◀ fecha (día + mes + año) ▶ en barra azul. Fila 2: abreviaturas de días a todo el ancho.
 */

import React, { useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  type LayoutChangeEvent,
} from "react-native";
import { DAY_LETTERS } from "../../constants/agenda";
import { usePreferences } from "../../contexts/PreferencesContext";
import { scaledFontSize, titleFont } from "../../utils/typography";
import { useAgendaNavStyles } from "../AgendaNavBar";

export type DayCellWindowRect = {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AgendaHeaderProps = {
  /** Fecha para la barra azul: "24 junio 2026". */
  displayDate: string;
  selectedDayIndex: number;
  /** Día resaltado durante drag (p. ej. dedo sobre Mié); si null, solo `selectedDayIndex`. */
  highlightDayIndex?: number | null;
  onSelectDay: (index: number) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onDatePress?: () => void;
  /** Rectángulos de Lun–Dom en coordenadas de ventana (para hit-test al arrastrar). */
  onDayCellsWindowLayout?: (cells: DayCellWindowRect[]) => void;
};

export function AgendaHeader({
  displayDate,
  selectedDayIndex,
  highlightDayIndex = null,
  onSelectDay,
  onPrevious,
  onNext,
  onDatePress,
  onDayCellsWindowLayout,
}: AgendaHeaderProps) {
  const { colors, fontScale } = usePreferences();
  const navStyles = useAgendaNavStyles();
  const cellRefs = useRef<(View | null)[]>([]);
  const measureTokenRef = useRef(0);

  const reportDayCells = useCallback(() => {
    if (!onDayCellsWindowLayout) return;
    const token = ++measureTokenRef.current;
    const pending = DAY_LETTERS.map(
      (_, index) =>
        new Promise<DayCellWindowRect | null>((resolve) => {
          const node = cellRefs.current[index];
          if (!node || typeof (node as View).measureInWindow !== "function") {
            resolve(null);
            return;
          }
          (node as View).measureInWindow((x, y, width, height) => {
            resolve({ index, x, y, width, height });
          });
        })
    );
    void Promise.all(pending).then((rects) => {
      if (token !== measureTokenRef.current) return;
      const cells = rects.filter((r): r is DayCellWindowRect => r != null && r.width > 0);
      if (cells.length > 0) onDayCellsWindowLayout(cells);
    });
  }, [onDayCellsWindowLayout]);

  const onDayRowLayout = useCallback(
    (_e: LayoutChangeEvent) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(reportDayCells);
      });
    },
    [reportDayCells]
  );

  const styles = useMemo(() => {
    const f = (n: number) => scaledFontSize(n, fontScale);
    const rowPadV = Math.max(2, Math.round(4 * fontScale));
    return StyleSheet.create({
      header: {
        backgroundColor: colors.agendaHeaderBg,
        borderBottomWidth: 3,
        borderBottomColor: colors.agendaHeaderRule,
      },
      dateRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: Math.max(4, Math.round(6 * fontScale)),
        backgroundColor: colors.agendaDateChipBg,
      },
      datePress: {
        flex: 1,
        minWidth: 0,
        justifyContent: "center",
        paddingHorizontal: Math.max(4, Math.round(6 * fontScale)),
      },
      dateArrow: {
        paddingHorizontal: Math.max(8, Math.round(10 * fontScale)),
        alignItems: "center",
        justifyContent: "center",
      },
      dateArrowText: {
        fontSize: f(12),
        color: colors.agendaDateChipText,
        ...titleFont,
      },
      dateText: {
        // 1.5x del tamaño anterior f(9): (9+5)*1.5 = 21 = f(16).
        fontSize: f(16),
        color: colors.agendaDateChipText,
        ...titleFont,
        textAlign: "center",
      },
      selectorRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: rowPadV,
        minHeight: Math.max(38, Math.round(44 * fontScale)),
      },
      /** Fila de días a todo el ancho; más alta que el nav compartido para que Lun/Mar/Mié se lean. */
      daySelector: {
        height: Math.max(34, Math.round(40 * fontScale)),
      },
      dayCell: {
        paddingHorizontal: Math.max(2, Math.round(4 * fontScale)),
      },
      dayText: {
        width: "100%",
        fontSize: f(12),
        color: colors.agendaHeaderText,
        ...titleFont,
        textAlign: "center",
      },
      dayTextSelected: {
        color: colors.agendaHeaderSelectedText,
      },
    });
  }, [colors, fontScale]);

  const activeDayIndex =
    highlightDayIndex != null ? highlightDayIndex : selectedDayIndex;

  return (
    <View style={styles.header}>
      <View style={styles.dateRow}>
        <TouchableOpacity
          style={styles.dateArrow}
          onPress={onPrevious}
          hitSlop={8}
        >
          <Text style={styles.dateArrowText}>{"◀"}</Text>
        </TouchableOpacity>
        <Pressable
          onPress={onDatePress}
          style={styles.datePress}
          disabled={!onDatePress}
        >
          <Text
            style={styles.dateText}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {displayDate}
          </Text>
        </Pressable>
        <TouchableOpacity style={styles.dateArrow} onPress={onNext} hitSlop={8}>
          <Text style={styles.dateArrowText}>{"▶"}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.selectorRow} onLayout={onDayRowLayout}>
        <View style={[navStyles.selector, styles.daySelector]}>
          {DAY_LETTERS.map((dayName, index) => (
            <View
              key={index}
              ref={(el) => {
                cellRefs.current[index] = el;
              }}
              style={[
                navStyles.letterCell,
                styles.dayCell,
                index === DAY_LETTERS.length - 1 && navStyles.letterCellLast,
                activeDayIndex === index && navStyles.letterCellSelected,
              ]}
              onLayout={reportDayCells}
            >
              <Pressable
                onPress={() => onSelectDay(index)}
                style={{ flex: 1, width: "100%", justifyContent: "center", alignItems: "center" }}
                accessibilityRole="button"
                accessibilityLabel={dayName}
              >
                <Text
                  style={[
                    styles.dayText,
                    activeDayIndex === index && styles.dayTextSelected,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {dayName}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
