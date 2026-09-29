/**
 * Título de evento con iconos opcionales: reloj (si tiene hora) y nota (si hay texto en note).
 * El título y cada icono pueden tener su propio onPress.
 */

import React from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { usePreferences } from "../../contexts/PreferencesContext";

const alarmaPng = require("../../../assets/alarma.png");
const notaPng = require("../../../assets/nota.png");

export type EventTitleWithIconsProps = {
  title: string;
  showAlarm: boolean;
  showNote: boolean;
  textStyle: StyleProp<TextStyle>;
  /** Tamaño lateral de cada icono (px) */
  iconSize?: number;
  numberOfLines?: number;
  /** Pulsar solo el texto del título (p. ej. edición inline) */
  onTitlePress?: () => void;
  /** Pulsar icono de reloj → detalles / hora del evento */
  onAlarmPress?: () => void;
  /** Pulsar icono de nota → modal de nota */
  onNotePress?: () => void;
};

export function EventTitleWithIcons({
  title,
  showAlarm,
  showNote,
  textStyle,
  iconSize = 26,
  numberOfLines = 2,
  onTitlePress,
  onAlarmPress,
  onNotePress,
}: EventTitleWithIconsProps) {
  const { colors } = usePreferences();
  const titleNode = onTitlePress ? (
    <Pressable
      onPress={onTitlePress}
      style={({ pressed }) => [
        { flex: 1, minWidth: 0, opacity: pressed ? 0.88 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Editar título: ${title || "Evento"}`}
    >
      <Text
        style={[textStyle, { flex: 1, minWidth: 0 }]}
        numberOfLines={numberOfLines}
      >
        {title}
      </Text>
    </Pressable>
  ) : (
    <Text
      style={[textStyle, { flex: 1, minWidth: 0 }]}
      numberOfLines={numberOfLines}
    >
      {title}
    </Text>
  );

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        flex: 1,
        minWidth: 0,
        gap: 8,
      }}
    >
      {titleNode}
      {(showAlarm || showNote) && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
          }}
        >
          {showAlarm ? (
            <Pressable
              onPress={onAlarmPress}
              hitSlop={10}
              disabled={!onAlarmPress}
              accessibilityRole="button"
              accessibilityLabel="Abrir detalle del evento"
              style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
            >
              <Image
                source={alarmaPng}
                style={{
                  width: iconSize,
                  height: iconSize,
                  tintColor: colors.iconActive,
                }}
                resizeMode="contain"
              />
            </Pressable>
          ) : null}
          {showNote ? (
            <Pressable
              onPress={onNotePress}
              hitSlop={10}
              disabled={!onNotePress}
              accessibilityRole="button"
              accessibilityLabel="Abrir nota del evento"
              style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
            >
              <Image
                source={notaPng}
                style={{
                  width: iconSize,
                  height: iconSize,
                  tintColor: colors.iconActive,
                }}
                resizeMode="contain"
              />
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}
