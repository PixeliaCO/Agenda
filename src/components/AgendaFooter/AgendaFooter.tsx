/**
 * Barra inferior de la pantalla de agenda.
 * Incluye cuatro botones de vista (día, semana, mes, eventos) y los botones Nuevo, Ir a y Hoy.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { AgendaViewTab } from '../../types/agenda';
import { usePreferences } from '../../contexts/PreferencesContext';
import { scaledFontSize } from '../../utils/typography';

export type AgendaFooterProps = {
  activeTab: AgendaViewTab;
  onTabChange: (tab: AgendaViewTab) => void;
  onNueva?: () => void;
  /** Vista día con evento seleccionado: abre el modal de detalles completos */
  onDetalles?: () => void;
  detallesEnabled?: boolean;
  onIrA?: () => void;
  onHoy?: () => void;
};

const BOX_SIZE = 24;
const DOT_SIZE = 4;
const LINE_HEIGHT = 2;
const LINE_WIDTH = 14;

export function AgendaFooter({
  activeTab,
  onTabChange,
  onNueva,
  onDetalles,
  detallesEnabled = false,
  onIrA,
  onHoy,
}: AgendaFooterProps) {
  const { colors, fontScale } = usePreferences();
  const fs = (n: number) => scaledFontSize(n, fontScale);
  const pad = 10 + Math.round((fontScale - 1) * 6);
  const styles = useMemo(
    () =>
      StyleSheet.create({
        footer: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-around',
          flexWrap: 'wrap',
          paddingVertical: pad,
          paddingHorizontal: 8,
          backgroundColor: colors.barBackground,
          borderTopWidth: 1,
          borderTopColor: colors.barBorder,
        },
        footerBtn: { alignItems: 'center', justifyContent: 'center', padding: 8 },
        iconBox: {
          width: BOX_SIZE,
          height: BOX_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1.5,
          borderColor: colors.text,
          borderRadius: 0,
        },
        grid2: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignContent: 'center',
          justifyContent: 'center',
          gap: 2,
          padding: 3,
        },
        grid4: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignContent: 'center',
          justifyContent: 'center',
          gap: 1,
          padding: 2,
        },
        dot: {
          width: DOT_SIZE,
          height: DOT_SIZE,
          backgroundColor: colors.text,
          borderRadius: 0,
        },
        dotCenter: { alignSelf: 'center' },
        dotTop: { marginBottom: 2 },
        iconLine: {
          width: LINE_WIDTH,
          height: LINE_HEIGHT,
          backgroundColor: colors.text,
          borderRadius: 0,
          marginTop: 2,
        },
        iconActive: { backgroundColor: colors.iconActive },
        iconBoxActive: { borderColor: colors.iconActive },
        footerTextBtn: { paddingVertical: 10, paddingHorizontal: 12 },
        footerTextBtnLabel: {
          fontSize: fs(14),
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
          color: colors.text,
        },
      }),
    [colors, fontScale]
  );

  function IconDay({ active }: { active: boolean }) {
    const dotStyle = [styles.dot, active && styles.iconActive];
    return (
      <View style={[styles.iconBox, active && styles.iconBoxActive]}>
        <View style={[styles.dotCenter, dotStyle]} />
      </View>
    );
  }
  function IconWeek({ active }: { active: boolean }) {
    const dotStyle = [styles.dot, active && styles.iconActive];
    return (
      <View style={[styles.iconBox, styles.grid2, active && styles.iconBoxActive]}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={dotStyle} />
        ))}
      </View>
    );
  }
  function IconMonth({ active }: { active: boolean }) {
    const dotStyle = [styles.dot, active && styles.iconActive];
    return (
      <View style={[styles.iconBox, styles.grid4, active && styles.iconBoxActive]}>
        {Array.from({ length: 16 }, (_, i) => (
          <View key={i} style={dotStyle} />
        ))}
      </View>
    );
  }
  function IconEvents({ active }: { active: boolean }) {
    const dotStyle = [styles.dot, styles.dotTop, active && styles.iconActive];
    const lineStyle = [styles.iconLine, active && styles.iconActive];
    return (
      <View style={[styles.iconBox, active && styles.iconBoxActive]}>
        <View style={dotStyle} />
        <View style={lineStyle} />
        <View style={lineStyle} />
      </View>
    );
  }

  return (
    <View style={styles.footer}>
      <TouchableOpacity style={styles.footerBtn} onPress={() => onTabChange('day')}>
        <IconDay active={activeTab === 'day'} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.footerBtn} onPress={() => onTabChange('week')}>
        <IconWeek active={activeTab === 'week'} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.footerBtn} onPress={() => onTabChange('month')}>
        <IconMonth active={activeTab === 'month'} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.footerBtn} onPress={() => onTabChange('events')}>
        <IconEvents active={activeTab === 'events'} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.footerTextBtn} onPress={onNueva}>
        <Text style={styles.footerTextBtnLabel}>Nuevo</Text>
      </TouchableOpacity>
      {onDetalles ? (
        <TouchableOpacity
          style={styles.footerTextBtn}
          onPress={onDetalles}
          disabled={!detallesEnabled}
          accessibilityState={{ disabled: !detallesEnabled }}
        >
          <Text
            style={[
              styles.footerTextBtnLabel,
              !detallesEnabled && { opacity: 0.4 },
            ]}
          >
            Detalles
          </Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity style={styles.footerTextBtn} onPress={onIrA}>
        <Text style={styles.footerTextBtnLabel}>Ir a</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.footerTextBtn} onPress={onHoy}>
        <Text style={styles.footerTextBtnLabel}>Hoy</Text>
      </TouchableOpacity>
    </View>
  );
}
