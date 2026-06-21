/**
 * Contenedor de pantalla completa estilo Palm: cabecera azul con título y ✕.
 * Sustituye los modales flotantes por vistas apiladas.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePreferences } from '../../contexts/PreferencesContext';
import { scaledFontSize, titleFont } from '../../utils/typography';

export type PalmScreenShellProps = {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Oculta el botón ✕ (p. ej. pantalla raíz con acciones propias). */
  hideClose?: boolean;
  /** Icono derecho de cabecera (por defecto ✕; «info» estilo Palm Datebook). */
  headerIcon?: 'close' | 'info';
  onHeaderIconPress?: () => void;
  contentStyle?: ViewStyle;
  footerStyle?: ViewStyle;
};

export function PalmScreenShell({
  title,
  onClose,
  children,
  footer,
  hideClose = false,
  headerIcon = 'close',
  onHeaderIconPress,
  contentStyle,
  footerStyle,
}: PalmScreenShellProps) {
  const insets = useSafeAreaInsets();
  const { colors, fontScale } = usePreferences();
  const fs = (n: number) => scaledFontSize(n, fontScale);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: colors.viewScreenBackground },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.agendaDateChipBg,
          paddingTop: Math.max(insets.top, 8),
          paddingBottom: 10,
          paddingHorizontal: 12,
        },
        headerSide: { width: 36, alignItems: 'flex-end' as const },
        headerTitle: {
          flex: 1,
          textAlign: 'center' as const,
          color: colors.agendaDateChipText,
          fontSize: fs(16),
          ...titleFont,
        },
        headerClose: {
          color: colors.agendaDateChipText,
          fontSize: fs(17),
          paddingHorizontal: 4,
        },
        headerInfo: {
          color: colors.agendaDateChipText,
          fontSize: fs(15),
          fontWeight: 'bold',
          width: 22,
          height: 22,
          lineHeight: 22,
          textAlign: 'center' as const,
          borderWidth: 1.5,
          borderColor: colors.agendaDateChipText,
          borderRadius: 11,
          overflow: 'hidden' as const,
        },
        content: { flex: 1, backgroundColor: colors.viewScreenBackground },
        footer: {
          paddingBottom: Math.max(insets.bottom, 12),
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.line,
          backgroundColor: colors.viewScreenBackground,
        },
      }),
    [colors, fontScale, insets.top, insets.bottom]
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headerSide} />
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.headerSide}>
          {!hideClose && headerIcon === 'close' ? (
            <TouchableOpacity
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
            >
              <Text style={styles.headerClose}>✕</Text>
            </TouchableOpacity>
          ) : !hideClose && headerIcon === 'info' ? (
            <TouchableOpacity
              onPress={onHeaderIconPress ?? onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Información"
            >
              <Text style={styles.headerInfo}>i</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      <View style={[styles.content, contentStyle]}>{children}</View>
      {footer ? <View style={[styles.footer, footerStyle]}>{footer}</View> : null}
    </View>
  );
}

type ScreenOverlayProps = {
  children: React.ReactNode;
  zIndex?: number;
};

/** Capa a pantalla completa sobre la agenda (sin Modal de RN). */
export function ScreenOverlay({ children, zIndex = 50 }: ScreenOverlayProps) {
  return (
    <View
      style={[
        StyleSheet.absoluteFillObject,
        { zIndex, elevation: zIndex, flex: 1 },
      ]}
    >
      {children}
    </View>
  );
}
