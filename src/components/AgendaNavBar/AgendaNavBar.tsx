/**
 * Barra de navegación Palm compartida: recuadro azul izquierdo + slot derecho + regla inferior.
 */

import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { usePreferences } from '../../contexts/PreferencesContext';
import { scaledFontSize, titleFont } from '../../utils/typography';

export type AgendaNavBarProps = {
  chipLabel: string;
  onChipPress?: () => void;
  children: React.ReactNode;
  chipStyle?: ViewStyle;
};

export function useAgendaNavStyles() {
  const { colors, fontScale } = usePreferences();
  return useMemo(() => {
    const f = (n: number) => scaledFontSize(n, fontScale);
    const baseText = { fontFamily: 'PixelOperator', fontWeight: 'normal' as const };
    const selectorHeight = Math.max(22, Math.round(26 * fontScale));
    const rowPadH = Math.max(2, Math.round(4 * fontScale));
    const arrowPadH = Math.max(4, Math.round(6 * fontScale));
    return StyleSheet.create({
      rightWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: rowPadH,
        flex: 1,
        minWidth: 0,
      },
      arrowCell: {
        paddingHorizontal: arrowPadH,
        alignItems: 'center',
        justifyContent: 'center',
      },
      arrowText: { fontSize: f(11), color: colors.agendaHeaderText, ...baseText },
      selector: {
        flexDirection: 'row',
        alignItems: 'stretch',
        height: selectorHeight,
        borderWidth: 1,
        borderColor: colors.agendaHeaderBorder,
        flex: 1,
        minWidth: 0,
      },
      selectorLabel: {
        paddingHorizontal: Math.max(6, Math.round(10 * fontScale)),
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 0,
      },
      selectorLabelText: {
        fontSize: f(13),
        color: colors.agendaHeaderText,
        ...titleFont,
        textAlign: 'center',
      },
      letterCell: {
        flex: 1,
        paddingHorizontal: Math.max(0, Math.round(1 * fontScale)),
        minWidth: 0,
        alignItems: 'center',
        justifyContent: 'center',
        borderRightWidth: 1,
        borderRightColor: colors.agendaHeaderBorder,
      },
      letterCellLast: { borderRightWidth: 0 },
      letterCellSelected: { backgroundColor: colors.agendaHeaderSelectedBg },
      letterText: { fontSize: f(9), color: colors.agendaHeaderText, ...titleFont },
      letterTextSelected: { color: colors.agendaHeaderSelectedText },
    });
  }, [colors, fontScale]);
}

export function AgendaNavBar({ chipLabel, onChipPress, children, chipStyle }: AgendaNavBarProps) {
  const { colors, fontScale } = usePreferences();
  const styles = useMemo(() => {
    const f = (n: number) => scaledFontSize(n, fontScale);
    const chipPadH = Math.max(6, Math.round(8 * fontScale));
    return StyleSheet.create({
      header: {
        flexDirection: 'row',
        alignItems: 'stretch',
        justifyContent: 'space-between',
        minHeight: Math.max(28, Math.round(32 * fontScale)),
        backgroundColor: colors.agendaHeaderBg,
        borderBottomWidth: 3,
        borderBottomColor: colors.agendaHeaderRule,
      },
      dateChip: {
        justifyContent: 'center',
        paddingHorizontal: chipPadH,
        backgroundColor: colors.agendaDateChipBg,
        maxWidth: '58%',
        flexShrink: 1,
      },
      dateText: {
        fontSize: f(8),
        color: colors.agendaDateChipText,
        ...titleFont,
      },
      rightSlot: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
      },
    });
  }, [colors, fontScale]);

  return (
    <View style={styles.header}>
      <Pressable
        onPress={onChipPress}
        style={[styles.dateChip, chipStyle]}
        disabled={!onChipPress}
      >
        <Text
          style={styles.dateText}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.65}
        >
          {chipLabel}
        </Text>
      </Pressable>
      <View style={styles.rightSlot}>{children}</View>
    </View>
  );
}
