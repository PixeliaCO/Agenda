/**
 * Vista semanal de la agenda.
 * Cabecera: mes/año (Ene '26), número de semana con flechas, nombre del día y fecha.
 * Grid: franjas horarias (rango según opciones + eventos de la semana) y 7 columnas con líneas punteadas y verticales.
 */

import React, { useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Animated,
  Modal,
  Dimensions,
} from 'react-native';
import { usePreferences } from '../../contexts/PreferencesContext';
import {
  formatWeekMonthYearRange,
  getWeekNumber,
  getWeekDates,
  getSundayOfWeek,
  getDayOfMonth,
  formatDisplayDate,
  formatTime12h,
  formatTime12hShort,
} from '../../utils/date';
import type { Reminder } from '../../types/reminder';
import { reminderEndMinutesForLayout } from '../../utils/scheduleHours';
import { scaledFontSize } from '../../utils/typography';
import { EventTitleWithIcons } from '../EventTitleWithIcons';
import { WEEK_DAY_LETTERS } from '../../constants/agenda';

const TIME_COLUMN_WIDTH = 46;
const NUM_COLS = 7;
/** Altura mínima de cada fila horaria (px); evita celdas demasiado bajas en pantallas anchas. */
const WEEK_MIN_ROW_HEIGHT = 40;
/** Ancho mínimo de cada columna/día (px). Debe caber “Miércoles” en cabecera. */
const WEEK_MIN_DAY_COL_WIDTH = 92;
/** Ancho mínimo de carril cuando hay solapes. */
const LANE_MIN_WIDTH = 30;
const LANE_GAP = 2;
const COLUMN_HPADDING = 4;
/** Tope de altura visual del bloque en función del ancho del carril (evita “tiras” muy alargadas). */
const WEEK_BLOCK_MAX_HEIGHT_RATIO = 2.75;
const MIN_BLOCK_HEIGHT = 20;
const CELL_STACK_PADDING_V = 2;
const CELL_STACK_GAP = 2;
const CELL_EVENT_HIT_SLOP = 10;

type WeekGridRow = { slot24: string; display12h: string };
type WeekVisualRow = { slot24: string; display12h: string; hour: number; slotIndex: number };

/** Rango de filas horarias: preferencias + eventos de la semana. Etiqueta en 12h; slot24 para toques y layout. */
function buildWeekHourRange(
  reminders: Reminder[],
  weekDates: string[],
  scheduleStartHour: number,
  scheduleEndHour: number
): { gridRows: WeekGridRow[]; gridStartHour: number } {
  const inWeek = new Set(weekDates);
  let minMin: number | null = null;
  let maxMin: number | null = null;
  for (const r of reminders) {
    if (!inWeek.has(r.date)) continue;
    const s = timeToMinutes(r.startTime);
    const e = reminderEndMinutesForLayout(r.startTime, r.endTime);
    if (minMin === null || s < minMin) minMin = s;
    if (maxMin === null || e > maxMin) maxMin = e;
  }
  let startHour = scheduleStartHour;
  let endHour = scheduleEndHour;
  if (minMin != null && maxMin != null) {
    startHour = Math.min(scheduleStartHour, Math.max(0, Math.floor(minMin / 60) - 1));
    endHour = Math.max(scheduleEndHour, Math.min(23, Math.ceil(maxMin / 60) + 1));
  }
  if (endHour < startHour) endHour = startHour;
  const gridRows: WeekGridRow[] = [];
  for (let h = startHour; h <= endHour; h++) {
    const slot24 = `${String(h).padStart(2, '0')}:00`;
    gridRows.push({ slot24, display12h: formatTime12hShort(slot24) });
  }
  return { gridRows, gridStartHour: startHour };
}

/** Convierte "HH:mm" a minutos desde medianoche */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

function remindersStartingInHour(reminders: Reminder[], hour: number): Reminder[] {
  return reminders
    .filter((r) => Math.floor(timeToMinutes(r.startTime) / 60) === hour)
    .slice()
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime) || a.id.localeCompare(b.id));
}

/** Recordatorios de un día: sin hora arriba; el resto por hora de inicio */
function remindersForDay(reminders: Reminder[], dateISO: string): Reminder[] {
  return reminders.filter((r) => r.date === dateISO).sort((a, b) => {
    if (a.noTime !== b.noTime) return a.noTime ? -1 : 1;
    return timeToMinutes(a.startTime) - timeToMinutes(b.startTime) || a.id.localeCompare(b.id);
  });
}

/** Asigna a cada evento un carril para que los que se solapan queden lado a lado. Devuelve map lane -> reminders y numLanes. */
function computeOverlapLanes(reminders: Reminder[]): { byLane: Map<number, Reminder[]>; numLanes: number } {
  const sorted = [...reminders].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  const result: { r: Reminder; lane: number }[] = [];
  const laneEnd: number[] = [];
  for (const r of sorted) {
    const start = timeToMinutes(r.startTime);
    const end = reminderEndMinutesForLayout(r.startTime, r.endTime);
    let lane = 0;
    while (lane < laneEnd.length && laneEnd[lane] > start) lane++;
    if (lane === laneEnd.length) laneEnd.push(0);
    laneEnd[lane] = end;
    result.push({ r, lane });
  }
  const numLanes = Math.max(1, laneEnd.length);
  const byLane = new Map<number, Reminder[]>();
  for (let i = 0; i < numLanes; i++) byLane.set(i, []);
  for (const { r, lane } of result) byLane.get(lane)!.push(r);
  for (let i = 0; i < numLanes; i++) {
    const arr = byLane.get(i);
    if (arr && arr.length > 1) {
      arr.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime) || a.id.localeCompare(b.id));
    }
  }
  return { byLane, numLanes };
}

type LaneMetrics = {
  laneWidth: number;
};

/** Reparte el ancho de columna (ya ampliado a nivel pantalla si hace falta) entre carriles. */
function getLaneMetrics(columnWidth: number, numLanes: number): LaneMetrics {
  const available = Math.max(0, columnWidth - COLUMN_HPADDING);
  if (numLanes <= 0) return { laneWidth: available };
  const gaps = Math.max(0, numLanes - 1) * LANE_GAP;
  const split = (available - gaps) / numLanes;
  return { laneWidth: split };
}

type WeekScrollLayout = {
  viewportW: number;
  baseDayCol: number;
  dayColW: number;
  contentW: number;
  needsHScroll: boolean;
};

/** Ancho mínimo por columna día según solapes; el scroll horizontal va a nivel de pantalla, no por carril. */
function computeWeekScrollLayout(viewportW: number, weekDates: string[], allReminders: Reminder[]): WeekScrollLayout {
  const baseDayCol = (viewportW - TIME_COLUMN_WIDTH) / NUM_COLS;
  // Mantén siempre el ancho base de una casilla. El “no solape” se resuelve dentro de la casilla (stack),
  // no ensanchando columnas.
  const dayColW = Math.max(WEEK_MIN_DAY_COL_WIDTH, baseDayCol);
  const contentW = TIME_COLUMN_WIDTH + NUM_COLS * dayColW;
  const needsHScroll = contentW > viewportW + 0.5;
  return { viewportW, baseDayCol, dayColW, contentW, needsHScroll };
}

/** Cuenta eventos cuyo **inicio** cae en la hora de esa fila (ej. fila 10:00 → empiezan entre 10:00 y 10:59). */
function countEventsStartingInGridHour(timed: Reminder[], gridStartHour: number, rowIndex: number): number {
  const hour = gridStartHour + rowIndex;
  let c = 0;
  for (const r of timed) {
    const startMin = timeToMinutes(r.startTime);
    if (Math.floor(startMin / 60) === hour) c++;
  }
  return c;
}

function computeSlotsPerHour(
  weekDates: string[],
  allReminders: Reminder[],
  gridStartHour: number,
  baseGridRows: WeekGridRow[]
): number[] {
  return baseGridRows.map((row) => {
    const hour = Number(row.slot24.slice(0, 2));
    let maxStarts = 0;
    for (const dateISO of weekDates) {
      const timed = remindersForDay(allReminders, dateISO).filter((r) => !r.noTime);
      const starts = remindersStartingInHour(timed, hour).length;
      if (starts > maxStarts) maxStarts = starts;
    }
    return Math.max(1, maxStarts);
  });
}

function expandVisualRows(baseGridRows: WeekGridRow[], slotsPerHour: number[]): WeekVisualRow[] {
  const out: WeekVisualRow[] = [];
  for (let i = 0; i < baseGridRows.length; i++) {
    const row = baseGridRows[i];
    const hour = Number(row.slot24.slice(0, 2));
    const slots = Math.max(1, slotsPerHour[i] ?? 1);
    for (let s = 0; s < slots; s++) {
      out.push({
        slot24: row.slot24,
        display12h: s === 0 ? row.display12h : '',
        hour,
        slotIndex: s,
      });
    }
  }
  return out;
}

/**
 * Altura por fila: base uniforme; solo se **alarga** la franja de una hora si en algún día
 * hay 2+ eventos que **empiezan** en esa hora (la grilla cede espacio, no se aplastan los bloques).
 */
function computeRowHeights(
  weekDates: string[],
  allReminders: Reminder[],
  gridStartHour: number,
  numRows: number,
  dayColW: number
): number[] {
  // Alto de cada hora independiente del ancho del día (para no “zoomear” vertical cuando crece el ancho).
  const base = WEEK_MIN_ROW_HEIGHT;
  return Array.from({ length: numRows }, () => base);
}

function yFromMinute(
  minute: number,
  gridStartHour: number,
  numRows: number,
  rowHeights: number[]
): number {
  const g0 = gridStartHour * 60;
  const g1 = g0 + numRows * 60;
  const m = Math.max(g0, Math.min(minute, g1));
  const rel = m - g0;
  const idx = Math.min(numRows - 1, Math.max(0, Math.floor(rel / 60)));
  const frac = (rel - idx * 60) / 60;
  let y = 0;
  for (let i = 0; i < idx; i++) y += rowHeights[i] ?? 0;
  y += frac * (rowHeights[idx] ?? 0);
  return y;
}

/** Top/height en px con filas de altura variable (la grilla se adapta a la carga de eventos por hora). */
function blockLayoutVariable(
  startTime: string,
  endTime: string | undefined,
  gridStartHour: number,
  numRows: number,
  rowHeights: number[]
): { top: number; height: number } {
  const startMin = timeToMinutes(startTime);
  const endMin = reminderEndMinutesForLayout(startTime, endTime);
  const g0 = gridStartHour * 60;
  const g1 = g0 + numRows * 60;
  const visibleStart = Math.max(startMin, g0);
  const visibleEnd = Math.min(endMin, g1);
  const top = yFromMinute(visibleStart, gridStartHour, numRows, rowHeights);
  const bottom = yFromMinute(visibleEnd, gridStartHour, numRows, rowHeights);
  const h = bottom - top;
  return { top, height: h > 0 ? Math.max(MIN_BLOCK_HEIGHT, h) : 0 };
}

export type WeekViewProps = {
  /** Fecha cualquiera de la semana a mostrar */
  weekAnchor: Date;
  /** Recordatorios de la semana (los 7 días) para mostrar indicador en celdas */
  reminders?: Reminder[];
  /** Navegación: semana anterior */
  onPreviousWeek: () => void;
  /** Navegación: semana siguiente */
  onNextWeek: () => void;
  /** Se llama al pulsar una celda: pasa la fecha (YYYY-MM-DD) y la hora de la fila (ej. "10:00") */
  onCellPress?: (dateISO: string, hourLabel: string) => void;
  /** Se llama al pulsar un bloque de evento: pasa el recordatorio (para abrir edición o detalles) */
  onReminderPress?: (reminder: Reminder) => void;
};

export function WeekView({
  weekAnchor,
  reminders = [],
  onPreviousWeek,
  onNextWeek,
  onCellPress,
  onReminderPress,
}: WeekViewProps) {
  const { colors, fontScale, preferences } = usePreferences();
  /** Ancho visible del cuerpo de la semana (para scroll horizontal a nivel pantalla). */
  const [viewportW, setViewportW] = useState(() => Dimensions.get('window').width);
  const hScrollX = useRef(new Animated.Value(0)).current;
  const [tooltipReminder, setTooltipReminder] = useState<Reminder | null>(null);
  const sunday = getSundayOfWeek(weekAnchor);
  const weekNum = getWeekNumber(sunday);
  const monthYear = formatWeekMonthYearRange(sunday);
  const weekDates = useMemo(() => getWeekDates(weekAnchor), [weekAnchor]);

  const timedForWeek = useMemo(() => reminders.filter((r) => !r.noTime), [reminders]);
  const { gridRows: baseGridRows, gridStartHour } = useMemo(
    () =>
      buildWeekHourRange(timedForWeek, weekDates, preferences.scheduleStartHour, preferences.scheduleEndHour),
    [timedForWeek, weekDates, preferences.scheduleStartHour, preferences.scheduleEndHour]
  );
  const slotsPerHour = useMemo(
    () => computeSlotsPerHour(weekDates, reminders, gridStartHour, baseGridRows),
    [weekDates, reminders, gridStartHour, baseGridRows]
  );
  const gridRows = useMemo(() => expandVisualRows(baseGridRows, slotsPerHour), [baseGridRows, slotsPerHour]);
  const numRows = gridRows.length;

  const onWeekBodyLayout = useCallback((e: { nativeEvent: { layout: { width: number } } }) => {
    const { width } = e.nativeEvent.layout;
    if (width > 0) setViewportW((prev) => (Math.abs(prev - width) < 0.5 ? prev : width));
  }, []);

  const weekScrollLayout = useMemo(
    () => computeWeekScrollLayout(viewportW, weekDates, reminders),
    [viewportW, weekDates, reminders]
  );

  const { dayColW, contentW: weekContentW, needsHScroll } = weekScrollLayout;

  /** Una entrada por fila horaria: más alta cuando en algún día hay varios eventos en esa misma hora. */
  const rowHeights = useMemo(
    () => computeRowHeights(weekDates, reminders, gridStartHour, numRows, dayColW),
    [weekDates, reminders, gridStartHour, numRows, dayColW]
  );
  const gridHeight = useMemo(() => rowHeights.reduce((a, h) => a + h, 0), [rowHeights]);

  const REMINDER_COLORS = useMemo(
    () => [colors.reminderDefault, colors.reminderAlt1, colors.reminderAlt2, colors.reminderAlt3],
    [colors]
  );
  const fs = (n: number) => scaledFontSize(n, fontScale);
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.screenBackground },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: colors.barBackground,
          borderBottomWidth: 1,
          borderBottomColor: colors.barBorder,
        },
        monthYear: {
          fontSize: fs(14),
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
          color: colors.daySelectedBg,
          textAlign: 'center',
        },
        weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
        weekArrow: { padding: 4 },
        weekArrowText: {
          fontSize: fs(17),
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
          color: colors.text,
          textAlign: 'center',
        },
        weekLabel: {
          fontSize: fs(17),
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
          color: colors.text,
          textAlign: 'center',
        },
        dayDateRow: { flexDirection: 'row', paddingVertical: 8, paddingLeft: 0, paddingRight: 0 },
        dayDateSpacer: { width: TIME_COLUMN_WIDTH, zIndex: 20, elevation: 20 },
        dayDateCells: { flexDirection: 'row' },
        dayDateCell: { alignItems: 'center', justifyContent: 'center', minWidth: 0, paddingHorizontal: 2 },
        dayLetter: {
          fontSize: fs(11),
          lineHeight: Math.round(fs(11) * 1.15),
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
          color: colors.textSecondary,
          textAlign: 'center',
          width: '100%',
        },
        dateNum: {
          fontSize: fs(26),
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
          color: colors.text,
          marginTop: 2,
          textAlign: 'center',
        },
        gridWrapper: { flex: 1, minHeight: 0 },
        gridScroll: { flex: 1 },
        gridScrollContent: { paddingBottom: 16 },
        gridContainer: { position: 'relative' as const },
        blocksOverlay: { position: 'absolute' as const, top: 0, flexDirection: 'row' },
        blockColumn: { position: 'relative' as const, overflow: 'hidden' as const },
        /** Área de carriles bajo chips “sin hora”; altura y top se pasan en línea. */
        laneScrollHost: {
          position: 'absolute' as const,
          left: 0,
          right: 0,
          overflow: 'hidden' as const,
        },
        laneRow: { flexDirection: 'row' as const, alignItems: 'stretch' as const },
        laneCellFixed: { position: 'relative' as const, overflow: 'hidden' as const },
        eventFill: {
          flex: 1,
          borderRadius: 0,
          borderWidth: 1,
          borderColor: colors.line,
        },
        pinChip: {
          marginHorizontal: 2,
          marginBottom: 2,
          paddingVertical: 2,
          paddingHorizontal: 4,
          borderRadius: 0,
          backgroundColor: colors.fieldFill,
          borderWidth: 1,
          borderColor: colors.line,
        },
        pinChipText: { fontSize: fs(20), fontFamily: 'PixelOperator', fontWeight: 'normal', color: colors.text },
        gridRow: {
          position: 'relative' as const,
          flexDirection: 'row',
          alignItems: 'stretch',
          borderBottomWidth: 1,
          borderStyle: 'dotted',
          borderColor: colors.line,
        },
        timeCell: {
          width: TIME_COLUMN_WIDTH,
          alignItems: 'center',
          justifyContent: 'center',
          position: 'absolute' as const,
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 20,
          elevation: 20,
          // sin fondo (transparente) para no tapar la grilla/días
        },
        timeLabel: {
          fontSize: fs(24),
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
          color: colors.text,
          textAlign: 'center',
        },
        gridCells: { flexDirection: 'row', marginLeft: TIME_COLUMN_WIDTH },
        cell: {
          borderLeftWidth: 1,
          borderColor: colors.line,
          backgroundColor: colors.cardBackground,
          alignItems: 'center',
          justifyContent: 'center',
        },
        cellFirst: { borderLeftWidth: 0 },
        weekHScroll: { flex: 1, minHeight: 0 },
        weekHScrollInner: { flex: 1, minHeight: 0 },
        tooltipModalRoot: {
          flex: 1,
        },
        tooltipBackdropFill: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: colors.backdrop,
        },
        tooltipCenterWrap: {
          ...StyleSheet.absoluteFillObject,
          justifyContent: 'center' as const,
          alignItems: 'center' as const,
          paddingHorizontal: 28,
          paddingVertical: 32,
        },
        tooltipCard: {
          width: '100%' as const,
          maxWidth: 300,
          backgroundColor: colors.cardBackground,
          borderRadius: 0,
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderWidth: 1,
          borderColor: colors.line,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.15,
          shadowRadius: 8,
          elevation: 6,
        },
        tooltipTitle: { fontSize: fs(26), fontFamily: 'PixelOperator', fontWeight: 'normal', color: colors.text },
        tooltipMeta: {
          fontSize: fs(23),
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
          color: colors.textSecondary,
          marginBottom: 8,
        },
        tooltipDesc: {
          fontSize: fs(23),
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
          color: colors.text,
          lineHeight: 35,
          marginBottom: 10,
        },
        tooltipDescScroll: { maxHeight: 120, marginBottom: 10 },
        tooltipActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
        tooltipBtn: { paddingVertical: 8, paddingHorizontal: 14 },
        tooltipBtnText: {
          fontSize: fs(24),
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
          color: colors.textSecondary,
        },
        tooltipBtnPrimary: { backgroundColor: colors.daySelectedBg, borderRadius: 0 },
        tooltipBtnTextPrimary: { color: colors.onAccentBg },
      }),
    [colors, fontScale]
  );

  const gridTotalW = TIME_COLUMN_WIDTH + NUM_COLS * dayColW;

  const gridContent = (
    <View
      style={[
        styles.gridContainer,
        { width: gridTotalW, height: gridHeight },
      ]}
    >
      {gridRows.map((row, ri) => (
        <View
          key={`${row.slot24}-${'slotIndex' in row ? (row as any).slotIndex : ri}-${ri}`}
          style={[styles.gridRow, { height: rowHeights[ri] ?? WEEK_MIN_ROW_HEIGHT }]}
        >
          <Animated.View style={[styles.timeCell, { transform: [{ translateX: hScrollX }] }]}>
            <Text style={styles.timeLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              {row.display12h}
            </Text>
          </Animated.View>
          <View style={[styles.gridCells, { width: NUM_COLS * dayColW }]}>
            {weekDates.map((dateISO, i) => (
              <Pressable
                key={dateISO}
                style={[styles.cell, i === 0 && styles.cellFirst, { width: dayColW }]}
                onPress={() => onCellPress?.(dateISO, row.slot24)}
              />
            ))}
          </View>
        </View>
      ))}
      <View
        style={[styles.blocksOverlay, { left: TIME_COLUMN_WIDTH, width: NUM_COLS * dayColW, height: gridHeight }]}
        pointerEvents="box-none"
      >
        {weekDates.map((dateISO) => {
          const dayReminders = remindersForDay(reminders, dateISO);
          const pinNo = dayReminders.filter((r) => r.noTime);
          const timed = dayReminders.filter((r) => !r.noTime);
          const nPin = pinNo.length;
          const pinH = nPin === 0 ? 0 : Math.min(56, nPin * 16 + 4);
          const laneAreaH = gridHeight - pinH;
          const stackEls = gridRows.map((vr, vi) => {
            const hour = vr.hour;
            const inHour = remindersStartingInHour(timed, hour);
            const r = inHour[vr.slotIndex];
            if (!r) return null;
            const rowTop = vi * (rowHeights[vi] ?? WEEK_MIN_ROW_HEIGHT);
            const rowH = rowHeights[vi] ?? WEEK_MIN_ROW_HEIGHT;
            const bg = r.color ?? REMINDER_COLORS[(timed.indexOf(r) + vi) % REMINDER_COLORS.length];
            return (
              <View
                key={`h-${hour}-s-${vr.slotIndex}`}
                pointerEvents="box-none"
                style={{
                  position: 'absolute',
                  top: rowTop,
                  left: 0,
                  right: 0,
                  height: rowH,
                  paddingVertical: CELL_STACK_PADDING_V,
                  paddingHorizontal: 2,
                }}
              >
                <Pressable
                  style={[styles.eventFill, { backgroundColor: bg }]}
                  hitSlop={CELL_EVENT_HIT_SLOP}
                  onPress={() => setTooltipReminder(r)}
                  accessibilityRole="button"
                />
              </View>
            );
          });
          return (
            <View key={dateISO} style={[styles.blockColumn, { width: dayColW }]}>
              {pinNo.length > 0 ? (
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 4, maxHeight: pinH }}>
                  {pinNo.map((r) => (
                    <Pressable
                      key={r.id}
                      style={styles.pinChip}
                      onPress={() => setTooltipReminder(r)}
                    >
                      <Text style={styles.pinChipText} numberOfLines={1}>
                        ○ {r.title || 'Evento'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <View style={[styles.laneScrollHost, { top: pinH, height: laneAreaH }]}>
                <View style={{ position: 'relative', width: '100%', height: laneAreaH }}>{stackEls}</View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );

  const tooltipDetailText =
    tooltipReminder?.note?.trim() || tooltipReminder?.description?.trim() || '';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.monthYear}>{monthYear}</Text>
        <View style={styles.weekNav}>
          <TouchableOpacity onPress={onPreviousWeek} style={styles.weekArrow} hitSlop={12}>
            <Text style={styles.weekArrowText}>{'<'}</Text>
          </TouchableOpacity>
          <Text style={styles.weekLabel}>Semana {weekNum}</Text>
          <TouchableOpacity onPress={onNextWeek} style={styles.weekArrow} hitSlop={12}>
            <Text style={styles.weekArrowText}>{'>'}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={{ flex: 1, minHeight: 0 }} onLayout={onWeekBodyLayout}>
        <Animated.ScrollView
          horizontal
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          style={styles.weekHScroll}
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: hScrollX } } }], {
            useNativeDriver: true,
          })}
          contentContainerStyle={{
            flexGrow: 1,
            minWidth: weekScrollLayout.viewportW,
            width: Math.max(weekScrollLayout.viewportW, weekContentW),
            minHeight: '100%',
          }}
          showsHorizontalScrollIndicator={needsHScroll}
        >
          <View
            style={[
              styles.weekHScrollInner,
              {
                width: Math.max(weekScrollLayout.viewportW, weekContentW),
                minHeight: '100%',
              },
            ]}
          >
            <View style={[styles.dayDateRow, { width: weekContentW }]}>
              <Animated.View style={[styles.dayDateSpacer, { transform: [{ translateX: hScrollX }] }]} />
              <View style={styles.dayDateCells}>
                {WEEK_DAY_LETTERS.map((dayName, i) => (
                  <View key={i} style={[styles.dayDateCell, { width: dayColW }]}>
                    <Text style={styles.dayLetter} numberOfLines={2}>
                      {dayName}
                    </Text>
                    <Text style={styles.dateNum}>{getDayOfMonth(weekDates[i])}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={[styles.gridWrapper, { flex: 1, minHeight: 0 }]}>
              <ScrollView
                style={styles.gridScroll}
                contentContainerStyle={styles.gridScrollContent}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled
              >
                {gridContent}
              </ScrollView>
            </View>
          </View>
        </Animated.ScrollView>
      </View>

      <Modal visible={!!tooltipReminder} transparent animationType="fade" onRequestClose={() => setTooltipReminder(null)}>
        <View style={styles.tooltipModalRoot}>
          <Pressable
            style={styles.tooltipBackdropFill}
            onPress={() => setTooltipReminder(null)}
            accessibilityLabel="Cerrar"
            accessibilityRole="button"
          />
          <View style={styles.tooltipCenterWrap} pointerEvents="box-none">
            {tooltipReminder ? (
              <View style={styles.tooltipCard}>
                <View style={{ marginBottom: 6 }}>
                  <Text style={styles.tooltipTitle} numberOfLines={2}>
                    {tooltipReminder.title?.trim() ? tooltipReminder.title : 'Evento'}
                  </Text>
                </View>
                <Text style={styles.tooltipMeta}>
                  {formatDisplayDate(tooltipReminder.date)}
                  {tooltipReminder.noTime
                    ? ' · Sin hora'
                    : ` · ${tooltipReminder.allDay ? 'Todo el día · ' : ''}${formatTime12h(tooltipReminder.startTime)}${
                        tooltipReminder.endTime && tooltipReminder.startTime !== tooltipReminder.endTime
                          ? ` - ${formatTime12h(tooltipReminder.endTime)}`
                          : ''
                      }`}
                </Text>
                {tooltipDetailText ? (
                  <ScrollView
                    style={styles.tooltipDescScroll}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={tooltipDetailText.length > 80}
                  >
                    <Text style={styles.tooltipDesc}>{tooltipDetailText}</Text>
                  </ScrollView>
                ) : null}
                <View style={styles.tooltipActions}>
                  <TouchableOpacity style={styles.tooltipBtn} onPress={() => setTooltipReminder(null)}>
                    <Text style={styles.tooltipBtnText}>Cerrar</Text>
                  </TouchableOpacity>
                  {onReminderPress ? (
                    <TouchableOpacity
                      style={[styles.tooltipBtn, styles.tooltipBtnPrimary]}
                      onPress={() => {
                        const r = tooltipReminder;
                        setTooltipReminder(null);
                        onReminderPress(r);
                      }}
                    >
                      <Text style={[styles.tooltipBtnText, styles.tooltipBtnTextPrimary]}>Editar</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}
