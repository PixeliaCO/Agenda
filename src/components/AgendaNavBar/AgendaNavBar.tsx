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
    return StyleSheet.create({
      rightWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
        flex: 1,
        minWidth: 0,
      },
      arrowCell: {
        paddingHorizontal: 6,
        alignItems: 'center',
        justifyContent: 'center',
      },
      arrowText: { fontSize: f(11), color: colors.agendaHeaderText, ...baseText },
      selector: {
        flexDirection: 'row',
        alignItems: 'stretch',
        height: 26,
        borderWidth: 1,
        borderColor: colors.agendaHeaderBorder,
        flex: 1,
        minWidth: 0,
      },
      selectorLabel: {
        paddingHorizontal: 10,
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
        paddingHorizontal: 1,
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
    return StyleSheet.create({
      header: {
        flexDirection: 'row',
        alignItems: 'stretch',
        justifyContent: 'space-between',
        minHeight: 32,
        backgroundColor: colors.agendaHeaderBg,
        borderBottomWidth: 3,
        borderBottomColor: colors.agendaHeaderRule,
      },
      dateChip: {
        justifyContent: 'center',
        paddingHorizontal: 10,
        backgroundColor: colors.agendaDateChipBg,
        maxWidth: '38%',
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
        <Text style={styles.dateText} numberOfLines={1}>
          {chipLabel}
        </Text>
      </Pressable>
      <View style={styles.rightSlot}>{children}</View>
    </View>
  );
}
