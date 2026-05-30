/**
 * Área principal de la agenda: lista de franjas horarias con líneas guía.
 * Cada fila muestra una hora (8:00 - 18:00). Los recordatorios se muestran como bloques
 * que ocupan el rango entre hora de inicio y fin (duración visible).
 */

import React, { useState, useEffect, useMemo, useCallback, useRef, type ElementRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEFAULT_HOURS, slotLabelTo24H } from '../../constants/agenda';
import { usePreferences } from '../../contexts/PreferencesContext';
import type { Reminder } from '../../types/reminder';
import { minutesToScheduleLabel, reminderEndMinutesForLayout } from '../../utils/scheduleHours';
import { scaledFontSize } from '../../utils/typography';
import { EventTitleWithIcons } from '../EventTitleWithIcons';

const notaPng = require('../../../assets/nota.png');

/** Espacio extra bajo el contenido cuando hay teclado (evita que el campo quede pegado al teclado). */
const KEYBOARD_SCROLL_EXTRA = 36;

const MIN_ROW_HEIGHT = 44;
const HOUR_ROW_HEIGHT = 56;
/**
 * Ancho del cajón de horas (texto centrado; sin estirar a todo el ancho).
 * Ajustado a etiquetas tipo "12:30" + padding interno simétrico.
 */
const TIME_COLUMN_WIDTH = 62;
/** Separación cajón de títulos respecto a la columna hora+franja (algo menor = más ancho útil al título). */
const SLOT_MARGIN_LEFT = 4;
/** Padding interno del cajón de eventos (misma referencia vertical que la columna de horas) */
const SLOT_BOX_PADDING = 3;
/** Ancho de la franja de color (más ancha = mejor lectura y rebanadas al solapar). */
const BAR_WIDTH = 14;
/** Hueco entre franja y números de hora (evita que el texto roce la línea divisoria). */
const TIME_FRANJA_GAP = 6;
const TIME_COLUMN_COMBINED_WIDTH = BAR_WIDTH + TIME_FRANJA_GAP + TIME_COLUMN_WIDTH;
/** Posición X donde empieza la columna de horas (tras franja + hueco). */
const HOUR_COLUMN_LEFT = BAR_WIDTH + TIME_FRANJA_GAP;

/** Margen del bloque agenda respecto a los bordes de pantalla (container centrado). */
const SCHEDULE_SCREEN_INSET = 0;

/** "HH:mm" a minutos desde medianoche */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

export type AgendaScheduleProps = {
  /** Lista de horas a mostrar. Por defecto usa DEFAULT_HOURS. */
  hours?: readonly string[];
  /** Minutos desde medianoche (24h) por cada fila; si se pasa, evita interpretar "6:00" como 6 PM. */
  hourMinutes?: number[];
  /** Con hora en la cuadrícula (incluye todo el día con rango horario; excluir solo noTime) */
  reminders?: Reminder[];
  /** Sin hora: se muestran arriba de la cuadrícula */
  pinNoTime?: Reminder[];
  /** Se llama al pulsar la fila de una hora (crear en esa franja; no usar para abrir eventos existentes). */
  onSlotPress?: (payload: { hourLabel: string; hourIndex: number; fragmentIndex: number }) => void;
  /** Pulsar el título del evento: edición inline del título. */
  onReminderPress?: (reminder: Reminder) => void;
  /** Pulsar la hora de inicio en la columna de horas: detalles completos (modal). */
  onReminderHourPress?: (reminder: Reminder) => void;
  onReminderAlarmIconPress?: (reminder: Reminder) => void;
  onReminderNoteIconPress?: (reminder: Reminder) => void;
  /** ID del recordatorio seleccionado (resaltado en la lista) */
  selectedReminderId?: string | null;
  /** `${hourIndex}-${fragmentIndex}` — misma hora puede repetirse en varias filas si hay varios inicios. */
  inlineSlot?: string | null;
  onInlineSave?: (hourLabel: string, title: string, rowIndex: number) => void;
  onInlineCancel?: () => void;
  /** Edición inline del título de un evento existente (sin modal) */
  titleEditReminderId?: string | null;
  titleEditDraft?: string;
  onTitleEditChange?: (text: string) => void;
  /** Guardar título o borrar si quedó vacío; debe ser síncrono respecto al estado del padre */
  onCommitTitleEdit?: () => boolean;
  /** Tras crear un evento: desplazar el scroll a la hora de inicio (`startMinutes` null = arriba del día). */
  scrollFocusRequest?: { token: number; startMinutes: number | null } | null;
};

function getRowStartMin(hours: readonly string[], hourMinutes: number[] | undefined, i: number): number {
  if (hourMinutes != null && i < hourMinutes.length) return hourMinutes[i];
  return timeToMinutes(slotLabelTo24H(hours[i]));
}

/** Fin de la fila i en minutos (coherente con alturas de `rowLayout`). */
function getRowEndMin(hours: readonly string[], hourMinutes: number[] | undefined, i: number): number {
  const rowStart = getRowStartMin(hours, hourMinutes, i);
  if (i < hours.length - 1) return getRowStartMin(hours, hourMinutes, i + 1);
  return rowStart + (rowStart % 60 === 30 ? 30 : 60);
}

/** El título del evento solo se muestra en la fila cuyo intervalo contiene la hora de inicio (no en filas de continuación). */
function eventStartsInRow(
  r: Reminder,
  hours: readonly string[],
  hourMinutes: number[] | undefined,
  rowIndex: number
): boolean {
  const startMin = timeToMinutes(r.startTime);
  const rs = getRowStartMin(hours, hourMinutes, rowIndex);
  const re = getRowEndMin(hours, hourMinutes, rowIndex);
  return startMin >= rs && startMin < re;
}

/**
 * Posición Y en px desde el tope de la cuadrícula para un instante (minutos desde medianoche).
 * El inicio de cada fila `i` es el instante `getRowStartMin(i)` (borde superior de la fila);
 * la etiqueta de hora en la columna izquierda debe alinearse arriba (flex-start) para coincidir.
 */
function yFromMinute(
  minutes: number,
  hours: readonly string[],
  hourMinutes: number[] | undefined,
  rowLayout: { durationMin: number; heightPx: number }[]
): number {
  for (let i = 0; i < hours.length; i++) {
    const rs = getRowStartMin(hours, hourMinutes, i);
    const re = getRowEndMin(hours, hourMinutes, i);
    const { durationMin: d, heightPx: h } = rowLayout[i] ?? { durationMin: 60, heightPx: HOUR_ROW_HEIGHT };
    let y0 = 0;
    for (let j = 0; j < i; j++) y0 += rowLayout[j]?.heightPx ?? 0;

    if (minutes < rs) {
      return Math.round(y0);
    }
    if (minutes < re) {
      const t = d > 0 ? ((minutes - rs) / d) * h : 0;
      return Math.round(y0 + t * h);
    }
    if (minutes === re) {
      return Math.round(y0 + h);
    }
  }
  let total = 0;
  for (const r of rowLayout) total += r.heightPx;
  return Math.round(total);
}

/** Suma de alturas de filas 0..i-1 (inicio en Y del bloque hora i). */
function getRowBlockStartY(
  rowIndex: number,
  rowLayout: { durationMin: number; heightPx: number }[]
): number {
  let y = 0;
  for (let j = 0; j < rowIndex; j++) y += rowLayout[j]?.heightPx ?? 0;
  return y;
}

/**
 * Misma hora con varios inicios: ordenar por tiempo, luego por carril (franja) para que
 * la fila de título i coincida con la tira i de izquierda a derecha.
 */
function sortStartersForRow(starters: Reminder[], laneById: Map<string, number>): Reminder[] {
  return [...starters].sort((a, b) => {
    const ta = timeToMinutes(a.startTime);
    const tb = timeToMinutes(b.startTime);
    if (ta !== tb) return ta - tb;
    const la = laneById.get(a.id) ?? 0;
    const lb = laneById.get(b.id) ?? 0;
    if (la !== lb) return la - lb;
    return a.id.localeCompare(b.id);
  });
}

function parseInlineSlotHourIndex(inlineSlot: string | null): number | null {
  if (inlineSlot == null) return null;
  const parts = inlineSlot.split('-');
  if (parts.length < 2) return null;
  const hi = Number(parts[0]);
  return Number.isFinite(hi) ? hi : null;
}

/**
 * Asigna un carril (columna) a cada evento para que los que se solapan en el tiempo
 * no compartan el mismo espacio horizontal. Los no solapados reutilizan el carril 0.
 */
function assignEventLanes(reminders: Reminder[]): { laneById: Map<string, number>; maxLanes: number } {
  const laneById = new Map<string, number>();
  if (reminders.length === 0) {
    return { laneById, maxLanes: 1 };
  }
  type Ev = { id: string; start: number; end: number };
  const items: Ev[] = reminders.map((r) => {
    const start = timeToMinutes(r.startTime);
    const end = reminderEndMinutesForLayout(r.startTime, r.endTime);
    return { id: r.id, start, end };
  });
  items.sort((a, b) => a.start - b.start || a.end - b.end);

  const laneEnd: number[] = [];
  for (const ev of items) {
    let L = 0;
    for (;; L++) {
      const lastEnd = laneEnd[L];
      if (lastEnd === undefined || ev.start >= lastEnd) {
        laneById.set(ev.id, L);
        laneEnd[L] = ev.end;
        break;
      }
    }
  }
  const maxLanes = Math.max(1, ...Array.from(laneById.values(), (l) => l + 1));
  return { laneById, maxLanes };
}

export function AgendaSchedule({
  hours = DEFAULT_HOURS,
  hourMinutes,
  reminders = [],
  pinNoTime = [],
  onSlotPress,
  onReminderPress,
  onReminderHourPress,
  onReminderAlarmIconPress,
  onReminderNoteIconPress,
  selectedReminderId = null,
  inlineSlot = null,
  onInlineSave,
  onInlineCancel,
  titleEditReminderId = null,
  titleEditDraft = '',
  onTitleEditChange,
  onCommitTitleEdit,
  scrollFocusRequest = null,
}: AgendaScheduleProps) {
  const { colors, fontScale } = usePreferences();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  /** Enfoque explícito: tras cerrar un modal, `autoFocus` en el `TextInput` del título suele fallar. */
  const titleEditInputRef = useRef<ElementRef<typeof TextInput> | null>(null);
  const [pinnedHeaderHeight, setPinnedHeaderHeight] = useState(0);
  const lastScrollFocusTokenRef = useRef(0);
  const [keyboardBottomPad, setKeyboardBottomPad] = useState(0);
  const [inlineTitle, setInlineTitle] = useState('');
  const inlineCommittedRef = useRef(false);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subShow = Keyboard.addListener(showEvt, (e) => setKeyboardBottomPad(e.endCoordinates.height));
    const subHide = Keyboard.addListener(hideEvt, () => setKeyboardBottomPad(0));
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);
  useEffect(() => {
    if (inlineSlot) {
      setInlineTitle('');
      inlineCommittedRef.current = false;
    }
  }, [inlineSlot]);

  useEffect(() => {
    if (!titleEditReminderId) return undefined;
    const delay = Platform.OS === 'android' ? 320 : 220;
    const t = setTimeout(() => {
      titleEditInputRef.current?.focus();
    }, delay);
    return () => clearTimeout(t);
  }, [titleEditReminderId]);

  const tryCommitInline = useCallback(
    (hourLabel: string, hourIndex: number) => {
      if (titleEditReminderId) onCommitTitleEdit?.();
      if (inlineCommittedRef.current) return;
      inlineCommittedRef.current = true;
      const t = inlineTitle.trim();
      if (t) onInlineSave?.(hourLabel, t, hourIndex);
      else onInlineCancel?.();
    },
    [titleEditReminderId, onCommitTitleEdit, inlineTitle, onInlineSave, onInlineCancel]
  );

  /** Cierra el inline abierto (cualquier fila); los Pressable hijos no disparan blur del TextInput. */
  const tryCommitInlineAtActiveSlot = useCallback(() => {
    if (titleEditReminderId) onCommitTitleEdit?.();
    if (inlineSlot == null) return;
    const hi = parseInlineSlotHourIndex(inlineSlot);
    if (hi == null || hi < 0 || hi >= hours.length) return;
    tryCommitInline(hours[hi], hi);
  }, [titleEditReminderId, onCommitTitleEdit, inlineSlot, hours, tryCommitInline]);
  const scaledMinRowHeight = Math.max(MIN_ROW_HEIGHT, Math.round(MIN_ROW_HEIGHT * fontScale));
  const fs = (n: number) => scaledFontSize(n, fontScale);
  const rowMinH = Math.max(MIN_ROW_HEIGHT, Math.round(MIN_ROW_HEIGHT * fontScale));
  const eventTitleFontSize = fs(14);
  const eventRowPaddingV = Math.max(3, Math.round(5 * fontScale));
  const eventRowPaddingH = Math.max(4, Math.round(6 * fontScale));
  const eventRowMinHeight = Math.round(eventTitleFontSize * 1.3) + 2 * eventRowPaddingV;
  /** Alto por bloque de título: caben hasta ~2 líneas (varios eventos a la misma hora). */
  const titleBlockMinH = Math.max(
    eventRowMinHeight,
    Math.round(eventTitleFontSize * 1.25 * 2) + 2 * eventRowPaddingV
  );

  /** Agrupa recordatorios por índice de fila (ahora incluye los que se solapan con la fila). */
  const remindersByRowIndex = useMemo(() => {
    const map = new Map<number, Reminder[]>();
    for (let i = 0; i < hours.length; i++) map.set(i, []);
    for (const r of reminders) {
      const startMin = timeToMinutes(r.startTime);
      const endMin = reminderEndMinutesForLayout(r.startTime, r.endTime);
      for (let i = 0; i < hours.length; i++) {
        const rowStart = getRowStartMin(hours, hourMinutes, i);
        const rowEnd = getRowEndMin(hours, hourMinutes, i);
        if (startMin < rowEnd && endMin > rowStart) {
          const list = map.get(i) ?? [];
          list.push(r);
          map.set(i, list);
        }
      }
    }
    for (const [, list] of map) list.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    return map;
  }, [hours, hourMinutes, reminders]);

  /**
   * Altura por fila: proporcional a la duración del intervalo y, si hace falta, extra para n títulos
   * que empiezan en esa misma franja (evita cortar texto).
   */
  const rowLayout = useMemo(() => {
    const slotPad = 2 * SLOT_BOX_PADDING;
    const titleGap = 2;
    const layout: { durationMin: number; heightPx: number }[] = [];
    for (let i = 0; i < hours.length; i++) {
      const rowStart = getRowStartMin(hours, hourMinutes, i);
      const rowEnd = getRowEndMin(hours, hourMinutes, i);
      const durationMin = rowEnd - rowStart;
      const proportionalH = (durationMin / 60) * HOUR_ROW_HEIGHT;
      let heightPx = Math.max(scaledMinRowHeight, proportionalH);

      const rowEvents = remindersByRowIndex.get(i) ?? [];
      const starters = rowEvents.filter((r) => eventStartsInRow(r, hours, hourMinutes, i)).length;
      if (starters > 0) {
        const needForTitles =
          slotPad + starters * titleBlockMinH + Math.max(0, starters - 1) * titleGap;
        heightPx = Math.max(heightPx, needForTitles);
      }
      if (parseInlineSlotHourIndex(inlineSlot) === i) {
        heightPx = Math.max(heightPx, slotPad + rowMinH + 8);
      }
      layout.push({ durationMin, heightPx });
    }
    return layout;
  }, [
    hours,
    hourMinutes,
    scaledMinRowHeight,
    remindersByRowIndex,
    titleBlockMinH,
    inlineSlot,
    rowMinH,
  ]);
  const totalGridHeight = rowLayout.reduce((sum, r) => sum + r.heightPx, 0);
  /** Índice de solape solo para partir la franja en tiras finas dentro de BAR_WIDTH (sin ensanchar la columna). */
  const { laneById, maxLanes } = useMemo(() => assignEventLanes(reminders), [reminders]);

  const hasPinned = pinNoTime.length > 0;

  useEffect(() => {
    if (!hasPinned) setPinnedHeaderHeight(0);
  }, [hasPinned]);

  useEffect(() => {
    const req = scrollFocusRequest;
    if (!req) return;
    if (req.token === lastScrollFocusTokenRef.current) return;
    lastScrollFocusTokenRef.current = req.token;

    const run = () => {
      const el = scrollRef.current;
      if (!el) return;
      if (req.startMinutes == null) {
        el.scrollTo({ y: 0, animated: true });
        return;
      }
      const yGrid = yFromMinute(req.startMinutes, hours, hourMinutes, rowLayout);
      const topPad = pinnedHeaderHeight;
      const y = Math.max(0, topPad + yGrid - 120);
      el.scrollTo({ y, animated: true });
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
  }, [scrollFocusRequest, hours, hourMinutes, rowLayout, pinnedHeaderHeight]);

  /**
   * Una fila visual por cada "inicio" en esa hora: si hay 2 eventos a las 6:00, hay 2 filas con etiqueta "6:00".
   */
  const flatRows = useMemo(() => {
    const rows: {
      hourIndex: number;
      fragmentIndex: number;
      fragmentCount: number;
      hourLabel: string;
      rowH: number;
    }[] = [];
    for (let i = 0; i < hours.length; i++) {
      const rowEvents = remindersByRowIndex.get(i) ?? [];
      const rawStarters = rowEvents.filter((r) => eventStartsInRow(r, hours, hourMinutes, i));
      const starters = sortStartersForRow(rawStarters, laneById);
      const k = Math.max(1, starters.length);
      const totalH = rowLayout[i]?.heightPx ?? HOUR_ROW_HEIGHT;
      const hEach = totalH / k;
      for (let f = 0; f < k; f++) {
        rows.push({
          hourIndex: i,
          fragmentIndex: f,
          fragmentCount: k,
          hourLabel: hours[i],
          rowH: hEach,
        });
      }
    }
    return rows;
  }, [hours, hourMinutes, remindersByRowIndex, rowLayout, laneById]);
  /** Hueco fino entre tiras solapadas + ancho de cada rebanada (jerarquía visual más clara). */
  const FRANJA_SLICE_GAP = 1;
  const usableBarW = Math.max(1, BAR_WIDTH - (maxLanes - 1) * FRANJA_SLICE_GAP);
  const barSliceWidth = Math.max(1, Math.floor(usableBarW / maxLanes));
  const reminderColors = useMemo(
    () => [colors.reminderDefault, colors.reminderAlt1, colors.reminderAlt2, colors.reminderAlt3] as const,
    [colors]
  );

  /**
   * Un solo trazo vertical por evento (camino de inicio a fin), alineado con la franja junto a la hora.
   */
  const eventBarPaths = useMemo(() => {
    type Path = {
      id: string;
      color: string;
      top: number;
      height: number;
      startLabel: string;
      endLabel: string;
      lane: number;
      startMin: number;
    };
    const paths: Path[] = [];
    reminders.forEach((r, idx) => {
      if (r.noTime) return;
      const startMin = timeToMinutes(r.startTime);
      const endMin = reminderEndMinutesForLayout(r.startTime, r.endTime);
      /** Mismas etiquetas que las filas generadas con `buildHoursLabelsWithOptional30` */
      const startLabel = minutesToScheduleLabel(startMin);
      const endLabel = minutesToScheduleLabel(endMin);
      let startRow = -1;
      let endRow = -1;
      for (let i = 0; i < hours.length; i++) {
        const rs = getRowStartMin(hours, hourMinutes, i);
        const re = getRowEndMin(hours, hourMinutes, i);
        if (startMin < re && endMin > rs) {
          if (startRow === -1) startRow = i;
          endRow = i;
        }
      }
      if (startRow < 0 || endRow < 0) return;

      const rowEventsStart = remindersByRowIndex.get(startRow) ?? [];
      const rawStarters = rowEventsStart.filter((rem) =>
        eventStartsInRow(rem, hours, hourMinutes, startRow)
      );
      const starters = sortStartersForRow(rawStarters, laneById);
      const k = Math.max(1, starters.length);
      const rs = getRowStartMin(hours, hourMinutes, startRow);
      const { durationMin: dRow, heightPx: hRow } = rowLayout[startRow] ?? {
        durationMin: 60,
        heightPx: HOUR_ROW_HEIGHT,
      };
      const yFrac = dRow > 0 ? (startMin - rs) / dRow : 0;
      const starterIdx = starters.findIndex((s) => s.id === r.id);
      let yTop: number;
      if (k > 1 && starterIdx >= 0) {
        const yBlockStart = getRowBlockStartY(startRow, rowLayout);
        const fragH = hRow / k;
        yTop = Math.round(yBlockStart + starterIdx * fragH + yFrac * fragH);
      } else {
        yTop = yFromMinute(startMin, hours, hourMinutes, rowLayout);
      }
      const yBottom = yFromMinute(endMin, hours, hourMinutes, rowLayout);

      const rawH = yBottom - yTop;
      const height = Math.max(2, Math.min(rawH, totalGridHeight - yTop));
      const color = r.color ?? reminderColors[idx % reminderColors.length];
      const lane = laneById.get(r.id) ?? 0;
      paths.push({ id: r.id, color, top: yTop, height, startLabel, endLabel, lane, startMin });
    });
    /**
     * Jerarquía de dibujado: primero eventos que empiezan antes; a igualdad, carril izquierdo (0) debajo,
     * carriles a la derecha encima (zIndex mayor) para orden visual claro.
     */
    paths.sort((a, b) => a.startMin - b.startMin || a.lane - b.lane);
    return paths;
  }, [
    hours,
    hourMinutes,
    reminders,
    reminderColors,
    rowLayout,
    totalGridHeight,
    laneById,
    remindersByRowIndex,
  ]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        // Base para look retro (Palm): peso normal + pixel font
        // (se mezcla en estilos de texto específicos más abajo)
        scroll: { flex: 1 },
        keyboardAvoidRoot: { flex: 1, alignSelf: 'stretch' as const },
        scrollContent: {
          flexGrow: 1,
          paddingTop: SCHEDULE_SCREEN_INSET,
          paddingHorizontal: SCHEDULE_SCREEN_INSET,
        },
        pinnedWrap: { marginBottom: 12, gap: 10 },
        pinnedBlock: {
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 0,
          paddingVertical: 10,
          paddingHorizontal: 12,
          backgroundColor: colors.cardBackground,
        },
        pinnedHeading: {
          fontSize: fs(12),
          fontWeight: '700',
          color: colors.textSecondary,
          textTransform: 'uppercase' as const,
          letterSpacing: 0.4,
          marginBottom: 8,
        },
        pinnedHeadingIconRow: {
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
          alignSelf: 'stretch' as const,
          marginBottom: 10,
        },
        pinnedHeadingNotaIcon: {
          width: Math.max(24, Math.round(22 * fontScale)),
          height: Math.max(24, Math.round(22 * fontScale)),
        },
        pinnedRow: {
          paddingVertical: eventRowPaddingV,
          paddingHorizontal: eventRowPaddingH,
          borderRadius: 0,
          marginBottom: 6,
          backgroundColor: colors.fieldFill,
        },
        pinnedRowSelected: { backgroundColor: colors.daySelectedBg },
        /** Marco que encierra toda la cuadrícula (se distingue del fondo de la pantalla). */
        gridWrapper: {
          minHeight: 400,
          alignSelf: 'stretch' as const,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 0,
          overflow: 'hidden' as const,
        },
        /** El contenido útil ya lleva padding en scrollContent; aquí solo posicionamiento relativo. */
        rowsContainer: {
          position: 'relative' as const,
        },
        /** Fondo solo de la columna de franjas (no incluye la hora → evita bordes que “corten” el texto). */
        franjaZoneBackdrop: {
          position: 'absolute' as const,
          left: 0,
          top: 0,
          width: BAR_WIDTH,
          backgroundColor: colors.cardBackground,
          borderWidth: 1,
          borderColor: colors.line,
          borderRightWidth: 0,
          zIndex: 0,
        },
        /** Fondo solo de la columna de horas, separada visualmente de la franja. */
        hourZoneBackdrop: {
          position: 'absolute' as const,
          top: 0,
          backgroundColor: colors.cardBackground,
          borderWidth: 1,
          borderColor: colors.line,
          borderLeftWidth: 0,
          zIndex: 0,
        },
        /** Línea vertical entre columnas; zIndex 0 para no pintar encima del texto de la hora. */
        timeColumnConnector: {
          position: 'absolute' as const,
          top: 0,
          width: 1,
          zIndex: 0,
          backgroundColor: colors.line,
          opacity: 0.55,
        },
        row: {
          flexDirection: 'row',
          alignItems: 'stretch' as const,
          paddingLeft: 0,
          zIndex: 1,
        },
        /** Fila del calendario: cuerpo (hora + cajón) y debajo la línea punteada entre horas */
        scheduleRow: {
          flexDirection: 'column' as const,
          paddingLeft: 0,
          zIndex: 1,
          position: 'relative' as const,
        },
        scheduleRowBody: {
          flex: 1,
          flexDirection: 'row' as const,
          alignItems: 'stretch' as const,
          minHeight: 0,
          zIndex: 1,
          pointerEvents: 'box-none' as const,
        },
        /**
         * Línea entre horas: absolute para no restar altura al cuerpo (yFromMinute / franjas = altura fila completa).
         */
        hourRowSeparator: {
          position: 'absolute' as const,
          left: 0,
          right: 0,
          bottom: 0,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderStyle: 'dotted' as const,
          borderColor: colors.line,
          pointerEvents: 'none' as const,
        },
        barPathOverlay: {
          position: 'absolute' as const,
          left: 0,
          top: 0,
          zIndex: 3,
          elevation: 3,
        },
        /** Solo columna de franja (sin invadir la columna de horas). */
        eventIntervalBlock: {
          position: 'absolute' as const,
        },
        /** Contenedor fijo del ancho de franja; cada evento solapado pinta solo su rebanada. */
        eventBarSliceHost: {
          width: BAR_WIDTH,
          height: '100%' as const,
          position: 'relative' as const,
        },
        /** Bloque izquierdo: columna franja + columna hora (ancho fijo total). */
        leftColumnsRow: {
          flexDirection: 'row' as const,
          alignItems: 'stretch' as const,
          width: TIME_COLUMN_COMBINED_WIDTH,
          backgroundColor: 'transparent',
          pointerEvents: 'box-none' as const,
        },
        /** Columna 1: solo espacio reservado a la franja (el color va en el overlay). */
        franjaColumn: {
          width: BAR_WIDTH,
          flexShrink: 0,
          pointerEvents: 'box-none' as const,
        },
        /** Columna 2: hora centrada en la fila (vertical y horizontal), cajón de ancho fijo ajustado. */
        hourColumn: {
          width: TIME_COLUMN_WIDTH,
          marginLeft: TIME_FRANJA_GAP,
          flexShrink: 0,
          justifyContent: 'center' as const,
          alignItems: 'center' as const,
          paddingHorizontal: 8,
          zIndex: 2,
          pointerEvents: 'box-none' as const,
        },
        /** Solo ancho fijo: si lleva flex:1 roba espacio al texto de la hora (truncado "8:...") */
        barStrip: { position: 'relative' as const, flexShrink: 0 as const },
        timeLabel: {
          fontSize: fs(14),
          color: colors.textSecondary,
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
          textAlign: 'center' as const,
          flexShrink: 0,
          ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
        },
        slotContent: {
          flex: 1,
          marginLeft: SLOT_MARGIN_LEFT,
          flexDirection: 'column' as const,
          justifyContent: 'flex-start' as const,
          minWidth: 0,
          minHeight: 0,
          backgroundColor: colors.screenBackground,
          borderRadius: 0,
          paddingTop: SLOT_BOX_PADDING,
          paddingHorizontal: SLOT_BOX_PADDING,
          paddingBottom: 0,
          pointerEvents: 'box-none' as const,
        },
        slotMain: {
          alignSelf: 'stretch' as const,
          flexDirection: 'column' as const,
          justifyContent: 'flex-start' as const,
          minWidth: 0,
        },
        /** Títulos alineados al inicio del intervalo (misma banda vertical que la franja) */
        slotEventsBlock: { justifyContent: 'flex-start' as const, minWidth: 0, marginBottom: 0 },
        eventTextRow: {
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'stretch',
          paddingVertical: eventRowPaddingV,
          paddingLeft: eventRowPaddingH,
          paddingRight: eventRowPaddingH,
          marginRight: 4,
          borderRadius: 0,
          marginTop: 0,
          minHeight: eventRowMinHeight,
        },
        eventTextRowSelected: { backgroundColor: colors.daySelectedBg },
        eventTextTitle: {
          fontSize: eventTitleFontSize,
          lineHeight: Math.round(eventTitleFontSize * 1.25),
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
          color: colors.text,
          maxWidth: '100%' as const,
        },
        inlineRow: {
          alignSelf: 'stretch' as const,
          minHeight: rowMinH,
          justifyContent: 'center' as const,
        },
        inlineInput: {
          flex: 1,
          minHeight: 36,
          borderWidth: 0,
          borderRadius: 0,
          borderColor: 'transparent',
          paddingHorizontal: 10,
          paddingVertical: 8,
          fontSize: fs(14),
          fontFamily: 'PixelOperator',
          fontWeight: 'normal',
          color: colors.text,
          backgroundColor: colors.cardBackground,
          ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' as const, outlineWidth: 0 } as const) : {}),
        },
      }),
    [
      colors,
      fontScale,
      rowMinH,
      totalGridHeight,
      eventTitleFontSize,
      eventRowPaddingV,
      eventRowPaddingH,
      eventRowMinHeight,
      fs,
    ]
  );

  const renderPinnedRow = (r: Reminder) => {
    const isSelected = r.id === selectedReminderId;
    if (r.id === titleEditReminderId) {
      return (
        <View
          key={r.id}
          style={[
            styles.pinnedRow,
            isSelected && r.id !== titleEditReminderId && styles.pinnedRowSelected,
          ]}
        >
          <TextInput
            ref={titleEditInputRef}
            style={styles.inlineInput}
            value={titleEditDraft}
            onChangeText={onTitleEditChange}
            autoFocus
            showSoftInputOnFocus
            returnKeyType="done"
            blurOnSubmit
            underlineColorAndroid="transparent"
            cursorColor={colors.text}
            selectionColor={colors.textSecondary}
            onSubmitEditing={() => onCommitTitleEdit?.()}
            onBlur={() => onCommitTitleEdit?.()}
          />
        </View>
      );
    }
    const iconSz = Math.max(24, Math.round(eventTitleFontSize * 1.45));
    return (
      <View
        key={r.id}
        style={[
          styles.pinnedRow,
          isSelected && r.id !== titleEditReminderId && styles.pinnedRowSelected,
        ]}
      >
        <EventTitleWithIcons
          title={r.title}
          showAlarm={Boolean(r.alarm && !r.noTime)}
          showNote={Boolean(r.note?.trim())}
          textStyle={styles.eventTextTitle}
          iconSize={iconSz}
          numberOfLines={2}
          onTitlePress={() => onReminderPress?.(r)}
          onAlarmPress={
            r.alarm && !r.noTime ? () => onReminderAlarmIconPress?.(r) : undefined
          }
          onNotePress={
            r.note?.trim() ? () => onReminderNoteIconPress?.(r) : undefined
          }
        />
      </View>
    );
  };

  const scrollPadBottom =
    SCHEDULE_SCREEN_INSET +
    // espacio extra: footer fijo fuera del scroll
    88 +
    insets.bottom +
    (keyboardBottomPad > 0 ? KEYBOARD_SCROLL_EXTRA : 0) +
    (Platform.OS === 'android'
      ? keyboardBottomPad
      : Math.round(keyboardBottomPad * 0.6));

  const Root: any = Platform.OS === 'ios' ? KeyboardAvoidingView : View;
  const rootProps =
    Platform.OS === 'ios'
      ? ({
          style: styles.keyboardAvoidRoot,
          behavior: 'padding',
          keyboardVerticalOffset: 0,
        } as const)
      : ({ style: styles.keyboardAvoidRoot } as const);

  return (
    <Root {...rootProps}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollPadBottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      >
      {hasPinned ? (
        <View
          style={styles.pinnedWrap}
          onLayout={(e) => setPinnedHeaderHeight(e.nativeEvent.layout.height)}
        >
          {pinNoTime.length > 0 ? (
            <View style={styles.pinnedBlock}>
              <View style={styles.pinnedHeadingIconRow} accessibilityRole="header">
                <Image
                  source={notaPng}
                  style={styles.pinnedHeadingNotaIcon}
                  resizeMode="contain"
                  accessibilityLabel="Sin hora"
                />
              </View>
              {pinNoTime.map(renderPinnedRow)}
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={[styles.gridWrapper, { minHeight: totalGridHeight }]}>
        <View style={styles.rowsContainer}>
          <View
            style={[styles.franjaZoneBackdrop, { height: totalGridHeight }]}
            pointerEvents="none"
          />
          <View
            style={[
              styles.hourZoneBackdrop,
              {
                left: HOUR_COLUMN_LEFT,
                width: TIME_COLUMN_WIDTH,
                height: totalGridHeight,
              },
            ]}
            pointerEvents="none"
          />
          <View
            style={[styles.timeColumnConnector, { left: HOUR_COLUMN_LEFT, height: totalGridHeight }]}
            pointerEvents="none"
          />
          <View
            style={[
              styles.timeColumnConnector,
              { left: HOUR_COLUMN_LEFT + TIME_COLUMN_WIDTH, height: totalGridHeight },
            ]}
            pointerEvents="none"
          />
          {flatRows.map(
            ({ hourIndex, fragmentIndex, fragmentCount, hourLabel, rowH: fragmentRowH }) => {
              const rowEvents = remindersByRowIndex.get(hourIndex) ?? [];
              const rawStarters = rowEvents.filter((r) =>
                eventStartsInRow(r, hours, hourMinutes, hourIndex)
              );
              const starters = sortStartersForRow(rawStarters, laneById);
              const k = Math.max(1, starters.length);
              /** Una fila visual por inicio: como mucho un título por fragmento. */
              const eventsWithTitleHere =
                k > 1
                  ? starters[fragmentIndex]
                    ? [starters[fragmentIndex]]
                    : []
                  : starters;
              const titleRowMinH = eventRowMinHeight;
              const titlePadV = eventRowPaddingV;
              const slotKey = `${hourIndex}-${fragmentIndex}`;
              const isInlineHere = inlineSlot === slotKey;
              const rowSlotPress = () => {
                const editingHere =
                  titleEditReminderId != null &&
                  eventsWithTitleHere.some((ev) => ev.id === titleEditReminderId);
                if (editingHere) {
                  onCommitTitleEdit?.();
                  return;
                }
                if (titleEditReminderId) {
                  onCommitTitleEdit?.();
                }
                if (inlineSlot != null) {
                  if (isInlineHere) {
                    tryCommitInline(hourLabel, hourIndex);
                    return;
                  }
                  tryCommitInlineAtActiveSlot();
                }
                onSlotPress?.({ hourLabel, hourIndex, fragmentIndex });
              };
              return (
                <View
                  key={`hour-${hourIndex}-${fragmentIndex}`}
                  style={[styles.scheduleRow, { height: fragmentRowH }]}
                >
                  <Pressable
                    style={[StyleSheet.absoluteFillObject, { zIndex: 0 }]}
                    onPress={rowSlotPress}
                    android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
                  />
                  <View style={styles.scheduleRowBody}>
                    <View style={styles.leftColumnsRow}>
                      <View style={styles.franjaColumn}>
                        <View style={[styles.barStrip, { width: BAR_WIDTH }]} />
                      </View>
                      <View style={styles.hourColumn}>
                        {eventsWithTitleHere.length === 1 ? (
                          <Pressable
                            onPress={() => {
                              const r = eventsWithTitleHere[0];
                              if (r?.id === titleEditReminderId) {
                                onCommitTitleEdit?.();
                                return;
                              }
                              if (inlineSlot != null) tryCommitInlineAtActiveSlot();
                              if (r) (onReminderHourPress ?? onReminderPress)?.(r);
                            }}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel={`Hora de inicio ${hourLabel}, detalles del evento`}
                          >
                            <Text style={styles.timeLabel} numberOfLines={1}>
                              {hourLabel}
                            </Text>
                          </Pressable>
                        ) : (
                          <Text style={styles.timeLabel} numberOfLines={1}>
                            {hourLabel}
                          </Text>
                        )}
                      </View>
                    </View>
                    <View
                      style={[
                        styles.slotContent,
                        {
                          paddingTop: fragmentIndex === 0 ? SLOT_BOX_PADDING : 2,
                          paddingBottom: fragmentIndex === fragmentCount - 1 ? SLOT_BOX_PADDING : 2,
                        },
                      ]}
                    >
                      {isInlineHere ? (
                        <View style={styles.inlineRow}>
                          <TextInput
                            style={styles.inlineInput}
                            value={inlineTitle}
                            onChangeText={setInlineTitle}
                            autoFocus
                            returnKeyType="done"
                            blurOnSubmit
                            underlineColorAndroid="transparent"
                            cursorColor={colors.text}
                            selectionColor={colors.textSecondary}
                            onSubmitEditing={() => tryCommitInline(hourLabel, hourIndex)}
                            onBlur={() => tryCommitInline(hourLabel, hourIndex)}
                          />
                        </View>
                      ) : (
                        <View style={styles.slotMain}>
                          <View style={styles.slotEventsBlock}>
                            {eventsWithTitleHere.map((r) => {
                              const isSelected = r.id === selectedReminderId;
                              if (r.id === titleEditReminderId) {
                                return (
                                  <View
                                    key={r.id}
                                    style={[
                                      styles.eventTextRow,
                                      isSelected &&
                                        r.id !== titleEditReminderId &&
                                        styles.eventTextRowSelected,
                                      {
                                        minHeight: titleRowMinH,
                                        paddingVertical: titlePadV,
                                      },
                                    ]}
                                  >
                                    <TextInput
                                      ref={titleEditInputRef}
                                      style={styles.inlineInput}
                                      value={titleEditDraft}
                                      onChangeText={onTitleEditChange}
                                      autoFocus
                                      showSoftInputOnFocus
                                      returnKeyType="done"
                                      blurOnSubmit
                                      underlineColorAndroid="transparent"
                                      cursorColor={colors.text}
                                      selectionColor={colors.textSecondary}
                                      onSubmitEditing={() => onCommitTitleEdit?.()}
                                      onBlur={() => onCommitTitleEdit?.()}
                                    />
                                  </View>
                                );
                              }
                              const iconSz = Math.max(24, Math.round(eventTitleFontSize * 1.45));
                              return (
                                <View
                                  key={r.id}
                                  style={[
                                    styles.eventTextRow,
                                    isSelected && styles.eventTextRowSelected,
                                    {
                                      minHeight: titleRowMinH,
                                      paddingVertical: titlePadV,
                                    },
                                  ]}
                                >
                                  <EventTitleWithIcons
                                    title={r.title}
                                    showAlarm={Boolean(r.alarm && !r.noTime)}
                                    showNote={Boolean(r.note?.trim())}
                                    textStyle={styles.eventTextTitle}
                                    iconSize={iconSz}
                                    numberOfLines={2}
                                    onTitlePress={() => {
                                      if (inlineSlot != null) tryCommitInlineAtActiveSlot();
                                      onReminderPress?.(r);
                                    }}
                                    onAlarmPress={
                                      r.alarm && !r.noTime
                                        ? () => {
                                            if (inlineSlot != null) tryCommitInlineAtActiveSlot();
                                            onReminderAlarmIconPress?.(r);
                                          }
                                        : undefined
                                    }
                                    onNotePress={
                                      r.note?.trim()
                                        ? () => {
                                            if (inlineSlot != null) tryCommitInlineAtActiveSlot();
                                            onReminderNoteIconPress?.(r);
                                          }
                                        : undefined
                                    }
                                  />
                                </View>
                              );
                            })}
                          </View>
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={styles.hourRowSeparator} />
                </View>
              );
            }
          )}
          {eventBarPaths.length > 0 ? (
            <View
              style={[styles.barPathOverlay, { width: BAR_WIDTH, height: totalGridHeight }]}
              pointerEvents="none"
            >
              {eventBarPaths.map((p) => {
                const lane = p.lane;
                const sliceLeft = lane * (barSliceWidth + FRANJA_SLICE_GAP);
                const sliceW = lane === maxLanes - 1 ? BAR_WIDTH - sliceLeft : barSliceWidth;
                /** Carril más a la derecha se dibuja encima (zIndex mayor). */
                const stackOrder = 10 + lane;
                return (
                  <View
                    key={p.id}
                    style={[
                      styles.eventIntervalBlock,
                      {
                        top: p.top,
                        height: p.height,
                        left: 0,
                        width: BAR_WIDTH,
                        zIndex: stackOrder,
                        elevation: stackOrder,
                      },
                    ]}
                  >
                    <View style={styles.eventBarSliceHost}>
                      <View
                        style={
                          {
                            position: 'absolute' as const,
                            left: sliceLeft,
                            top: 0,
                            width: sliceW,
                            height: '100%' as const,
                            backgroundColor: p.color,
                            borderRightWidth: lane < maxLanes - 1 ? 1 : 0,
                            borderRightColor: colors.screenBackground,
                          } as const
                        }
                      />
                    </View>
                  </View>
                );
              })}
          </View>
          ) : null}
        </View>
      </View>
    </ScrollView>
    </Root>
  );
}
