/**
 * Cabecera de la pantalla de agenda (estilo Palm Datebook del Treo de referencia).
 * Barra de título gris claro: fecha en recuadro azul a la izquierda y selector
 * ◀ L M M J V S D ▶ con letras negras a la derecha. Línea azul sólida debajo.
 */

import React from 'react';
import { View, Text, TouchableOpacity, Pressable } from 'react-native';
import { SINGLE_DAY_LETTERS } from '../../constants/agenda';
import { AgendaNavBar, useAgendaNavStyles } from '../AgendaNavBar';

export type AgendaHeaderProps = {
  /** Fecha corta para el recuadro azul: "8 Ene 26". */
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
  const styles = useAgendaNavStyles();

  return (
    <AgendaNavBar chipLabel={displayDate} onChipPress={onDatePress}>
      <View style={styles.rightWrap}>
        <TouchableOpacity style={styles.arrowCell} onPress={onPrevious} hitSlop={8}>
          <Text style={styles.arrowText}>{'◀'}</Text>
        </TouchableOpacity>
        <View style={styles.selector}>
          {SINGLE_DAY_LETTERS.map((letter, index) => (
            <Pressable
              key={index}
              onPress={() => onSelectDay(index)}
              style={[
                styles.letterCell,
                index === SINGLE_DAY_LETTERS.length - 1 && styles.letterCellLast,
                selectedDayIndex === index && styles.letterCellSelected,
              ]}
            >
              <Text
                style={[
                  styles.letterText,
                  selectedDayIndex === index && styles.letterTextSelected,
                ]}
                numberOfLines={1}
              >
                {letter}
              </Text>
            </Pressable>
          ))}
        </View>
        <TouchableOpacity style={styles.arrowCell} onPress={onNext} hitSlop={8}>
          <Text style={styles.arrowText}>{'▶'}</Text>
        </TouchableOpacity>
      </View>
    </AgendaNavBar>
  );
}
