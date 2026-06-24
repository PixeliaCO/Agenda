/**
 * Cabecera de la pantalla de agenda (estilo Palm Datebook).
 * Fila 1: fecha completa en barra azul. Fila 2: ◀ días completos ▶.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { DAY_LETTERS } from '../../constants/agenda';
import { usePreferences } from '../../contexts/PreferencesContext';
import { scaledFontSize, titleFont } from '../../utils/typography';
import { useAgendaNavStyles } from '../AgendaNavBar';

export type AgendaHeaderProps = {
  /** Fecha para la barra azul: "miércoles 24 junio 2026". */
  displayDate: string;
  selectedDayIndex: number;
  onSelectDay: (index: number) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onDatePress?: () => void;
};

export function AgendaHeader({
  displayDate,
  selectedDayIndex,
  onSelectDay,
  onPrevious,
  onNext,
  onDatePress,
}: AgendaHeaderProps) {
  const { colors, fontScale } = usePreferences();
  const navStyles = useAgendaNavStyles();
  const styles = useMemo(() => {
    const f = (n: number) => scaledFontSize(n, fontScale);
    const rowPadH = Math.max(2, Math.round(4 * fontScale));
    const rowPadV = Math.max(2, Math.round(4 * fontScale));
    return StyleSheet.create({
      header: {
        backgroundColor: colors.agendaHeaderBg,
        borderBottomWidth: 3,
        borderBottomColor: colors.agendaHeaderRule,
      },
      dateRow: {
        justifyContent: 'center',
        paddingHorizontal: Math.max(6, Math.round(10 * fontScale)),
        paddingVertical: Math.max(4, Math.round(6 * fontScale)),
        backgroundColor: colors.agendaDateChipBg,
      },
      dateText: {
        fontSize: f(9),
        color: colors.agendaDateChipText,
        ...titleFont,
        textAlign: 'center',
      },
      selectorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: rowPadH,
        paddingVertical: rowPadV,
        minHeight: Math.max(26, Math.round(30 * fontScale)),
      },
      dayText: {
        width: '100%',
        fontSize: f(7),
        color: colors.agendaHeaderText,
        ...titleFont,
        textAlign: 'center',
      },
      dayTextSelected: {
        color: colors.agendaHeaderSelectedText,
      },
    });
  }, [colors, fontScale]);

  return (
    <View style={styles.header}>
      <Pressable onPress={onDatePress} style={styles.dateRow} disabled={!onDatePress}>
        <Text
          style={styles.dateText}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {displayDate}
        </Text>
      </Pressable>
      <View style={styles.selectorRow}>
        <TouchableOpacity style={navStyles.arrowCell} onPress={onPrevious} hitSlop={8}>
          <Text style={navStyles.arrowText}>{'◀'}</Text>
        </TouchableOpacity>
        <View style={navStyles.selector}>
          {DAY_LETTERS.map((dayName, index) => (
            <Pressable
              key={index}
              onPress={() => onSelectDay(index)}
              style={[
                navStyles.letterCell,
                index === DAY_LETTERS.length - 1 && navStyles.letterCellLast,
                selectedDayIndex === index && navStyles.letterCellSelected,
              ]}
            >
              <Text
                style={[
                  styles.dayText,
                  selectedDayIndex === index && styles.dayTextSelected,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.55}
              >
                {dayName}
              </Text>
            </Pressable>
          ))}
        </View>
        <TouchableOpacity style={navStyles.arrowCell} onPress={onNext} hitSlop={8}>
          <Text style={navStyles.arrowText}>{'▶'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
