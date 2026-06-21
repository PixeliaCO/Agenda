/**
 * Barra inferior de la agenda (estilo Palm Datebook del Treo de referencia).
 * Izquierda: 4 iconos de vista (agenda/lista, día, semana, mes). El activo va en azul.
 * Derecha: botones Detalles, Nueva, Ir a, Hoy con borde fino redondeado.
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

const BOX_SIZE = 20;
const DOT = 3;

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
  const pad = 8 + Math.round((fontScale - 1) * 6);
  const styles = useMemo(
    () =>
      StyleSheet.create({
        footer: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'nowrap',
          paddingVertical: pad,
          paddingHorizontal: 6,
          gap: 4,
          // Mismo fondo claro que la pantalla; separa solo la línea azul (como la foto).
          backgroundColor: colors.screenBackground,
          borderTopWidth: 2,
          borderTopColor: colors.agendaHeaderRule,
        },
        iconGroup: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 0 },
        textGroup: { flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap', gap: 4, flexShrink: 1 },
        iconBtn: {
          width: BOX_SIZE,
          height: BOX_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: colors.footerBorder,
          backgroundColor: 'transparent',
        },
        iconBtnActive: {
          backgroundColor: colors.daySelectedBg,
          borderColor: colors.daySelectedBg,
        },
        // Filas/elementos de los glifos
        colCenter: { alignItems: 'center', justifyContent: 'center' },
        listRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginVertical: 1 },
        listLine: { width: 7, height: 2 },
        dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
        dayDot: { width: 4, height: 4, borderRadius: 2 },
        dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
        gridCol: { gap: 2 },
        gridRow: { flexDirection: 'row', gap: 2 },
        gridDot: { width: 2.5, height: 2.5, borderRadius: 1.25 },
        // Botones de texto (borde fino redondeado, fondo gris claro)
        footerTextBtn: {
          paddingVertical: 5,
          paddingHorizontal: 8,
          backgroundColor: 'transparent',
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.footerBorder,
          flexShrink: 1,
        },
        footerTextBtnLabel: {
          fontSize: fs(12),
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
          color: colors.footerText,
        },
      }),
    [colors, fontScale, pad]
  );

  /** Color del glifo según estado (blanco sobre azul activo). */
  const glyph = (active: boolean) => (active ? colors.onAccentBg : colors.footerText);

  /** 1) Agenda/lista: punto · raya+punto · raya+punto. */
  function IconAgenda({ active }: { active: boolean }) {
    const c = glyph(active);
    return (
      <View style={[styles.iconBtn, active && styles.iconBtnActive]}>
        <View style={styles.colCenter}>
          <View style={styles.listRow}>
            <View style={[styles.dot, { backgroundColor: c }]} />
          </View>
          {[0, 1].map((i) => (
            <View key={i} style={styles.listRow}>
              <View style={[styles.dot, { backgroundColor: c }]} />
              <View style={[styles.listLine, { backgroundColor: c }]} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  /** 2) Día: un punto. */
  function IconDay({ active }: { active: boolean }) {
    return (
      <View style={[styles.iconBtn, active && styles.iconBtnActive]}>
        <View style={[styles.dayDot, { backgroundColor: glyph(active) }]} />
      </View>
    );
  }

  /** 3) Semana: puntos horizontales (…). */
  function IconWeek({ active }: { active: boolean }) {
    const c = glyph(active);
    return (
      <View style={[styles.iconBtn, active && styles.iconBtnActive]}>
        <View style={styles.dotsRow}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.dot, { backgroundColor: c }]} />
          ))}
        </View>
      </View>
    );
  }

  /** 4) Mes: 4×4 puntos (4 filas de 4). */
  function IconMonth({ active }: { active: boolean }) {
    const c = glyph(active);
    return (
      <View style={[styles.iconBtn, active && styles.iconBtnActive]}>
        <View style={styles.gridCol}>
          {[0, 1, 2, 3].map((r) => (
            <View key={r} style={styles.gridRow}>
              {[0, 1, 2, 3].map((col) => (
                <View key={col} style={[styles.gridDot, { backgroundColor: c }]} />
              ))}
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.footer}>
      <View style={styles.iconGroup}>
        <TouchableOpacity onPress={() => onTabChange('events')}>
          <IconAgenda active={activeTab === 'events'} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onTabChange('day')}>
          <IconDay active={activeTab === 'day'} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onTabChange('week')}>
          <IconWeek active={activeTab === 'week'} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onTabChange('month')}>
          <IconMonth active={activeTab === 'month'} />
        </TouchableOpacity>
      </View>
      <View style={styles.textGroup}>
        {onDetalles ? (
          <TouchableOpacity
            style={styles.footerTextBtn}
            onPress={onDetalles}
            disabled={!detallesEnabled}
            accessibilityState={{ disabled: !detallesEnabled }}
          >
            <Text
              style={[styles.footerTextBtnLabel, !detallesEnabled && { opacity: 0.4 }]}
              numberOfLines={1}
            >
              Detalles
            </Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.footerTextBtn} onPress={onNueva}>
          <Text style={styles.footerTextBtnLabel} numberOfLines={1}>Nueva</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.footerTextBtn} onPress={onIrA}>
          <Text style={styles.footerTextBtnLabel} numberOfLines={1}>Ir a</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.footerTextBtn} onPress={onHoy}>
          <Text style={styles.footerTextBtnLabel} numberOfLines={1}>Hoy</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
