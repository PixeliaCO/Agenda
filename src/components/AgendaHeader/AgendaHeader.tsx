/**
 * Cabecera de la pantalla de agenda.
 * Muestra la fecha actual y el selector de día de la semana (nombre completo) con flechas de navegación.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet, Platform, ScrollView } from 'react-native';
import { DAY_LETTERS } from '../../constants/agenda';
import { usePreferences } from '../../contexts/PreferencesContext';
import { scaledFontSize } from '../../utils/typography';

export type AgendaHeaderProps = {
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
  const styles = useMemo(() => {
    const padV = 8 + Math.round((fontScale - 1) * 4);
    const f = (n: number) => scaledFontSize(n, fontScale);
    const dateFontSize = scaledFontSize(15, fontScale);
    const dayLabelFs = f(12);
    const dayLabelLineHeight = Math.round(dayLabelFs * 1.15);
    /** Ancho mínimo para “Miércoles” en una sola línea (fuente pixel ~0.58× por carácter). */
    const dayCellMinW = Math.max(76, Math.ceil(dayLabelFs * 'Miércoles'.length * 0.58));
    const dayLabelMinH = dayLabelLineHeight * 2 + 10;
    const arrowMin = Math.round(Math.max(32, Math.min(44, 36 * Math.min(fontScale, 1.2))));
    const baseText = { fontFamily: 'PixelOperator', fontWeight: 'normal' as const };
    return StyleSheet.create({
      header: {
        paddingHorizontal: 12,
        paddingVertical: padV,
        backgroundColor: colors.barBackground,
      },
      dateTouchable: {
        width: '100%' as const,
        minWidth: 0,
        paddingBottom: 10,
        paddingTop: 8,
        paddingHorizontal: 10,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: colors.barBorder,
        borderRadius: 0,
        overflow: 'hidden' as const,
        backgroundColor: colors.screenBackground,
      },
      headerDate: {
        width: '100%' as const,
        fontSize: dateFontSize,
        ...baseText,
        color: colors.text,
        lineHeight: Math.round(dateFontSize * 1.38),
        textAlign: 'center',
      },
      dayNav: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'stretch',
        gap: 4,
        flexWrap: 'nowrap' as const,
        marginTop: Math.round(10 + (fontScale - 1) * 6),
      },
      navArrow: {
        minWidth: arrowMin,
        minHeight: arrowMin,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 2,
      },
      navArrowText: { fontSize: f(17), color: colors.text, ...baseText },
      dayLetters: {
        flex: 1,
        minWidth: 0,
        maxWidth: '100%' as const,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: colors.barBorder,
        borderRadius: 0,
        backgroundColor: colors.screenBackground,
      },
      dayLettersScroll: {
        flexGrow: 1,
      },
      dayLettersScrollContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingVertical: 6,
        paddingHorizontal: 8,
        flexGrow: 1,
        minWidth: '100%' as const,
      },
      dayLetter: {
        minWidth: dayCellMinW,
        flexShrink: 0,
        minHeight: dayLabelMinH,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 0,
        paddingHorizontal: 3,
        paddingVertical: 4,
      },
      dayLetterSelected: { backgroundColor: colors.daySelectedBg },
      dayLetterText: {
        fontSize: dayLabelFs,
        lineHeight: dayLabelLineHeight,
        color: colors.text,
        ...baseText,
        textAlign: 'center',
        flexShrink: 0,
      },
      dayLetterTextSelected: { color: colors.onAccentBg },
    });
  }, [colors, fontScale]);

  return (
    <View style={styles.header}>
      <Pressable onPress={onDatePress} style={styles.dateTouchable} disabled={!onDatePress}>
        <Text
          style={styles.headerDate}
          numberOfLines={3}
          ellipsizeMode="tail"
          {...(Platform.OS === 'ios'
            ? ({ adjustsFontSizeToFit: true, minimumFontScale: 0.76 } as const)
            : {})}
        >
          {displayDate}
        </Text>
      </Pressable>
      <View style={styles.dayNav}>
        <TouchableOpacity style={styles.navArrow} onPress={onPrevious} hitSlop={8}>
          <Text style={styles.navArrowText}>{'<'}</Text>
        </TouchableOpacity>
        <View style={styles.dayLetters}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.dayLettersScroll}
            contentContainerStyle={styles.dayLettersScrollContent}
            bounces={false}
          >
            {DAY_LETTERS.map((dayName, index) => (
              <Pressable
                key={index}
                onPress={() => onSelectDay(index)}
                style={[styles.dayLetter, selectedDayIndex === index && styles.dayLetterSelected]}
              >
                <Text
                  style={[
                    styles.dayLetterText,
                    selectedDayIndex === index && styles.dayLetterTextSelected,
                  ]}
                  numberOfLines={2}
                  {...(Platform.OS === 'ios'
                    ? ({ adjustsFontSizeToFit: true, minimumFontScale: 0.72 } as const)
                    : {})}
                >
                  {dayName}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        <TouchableOpacity style={styles.navArrow} onPress={onNext} hitSlop={12}>
          <Text style={styles.navArrowText}>{'>'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
