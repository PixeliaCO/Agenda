import { slotLabelTo24H } from '../constants/agenda';

/** Minutos desde medianoche para ordenar etiquetas */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

function hour24ToLabel(hour24: number, minute = 0): string {
  const h = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
  const m = minute === 0 ? '00' : String(minute).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Devuelve un array de etiquetas de hora en formato 12h desde startHour hasta endHour (incluidos), en 24h.
 * Ej: buildHoursLabels(10, 20) => ['10:00','11:00','12:00','1:00',...,'8:00']
 * Si start > end devuelve al menos la hora de inicio.
 */
export function buildHoursLabels(startHour24: number, endHour24: number): string[] {
  const labels: string[] = [];
  const start = Math.max(0, Math.min(23, startHour24));
  const end = Math.max(0, Math.min(23, endHour24));
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  for (let h = lo; h <= hi; h++) {
    labels.push(hour24ToLabel(h));
  }
  return labels.length > 0 ? labels : [hour24ToLabel(8)];
}

/** Convierte hora 24h + minuto a etiqueta 12h (ej. 18, 30 -> "6:30") */
function hour24ToLabelWithMinute(hour24: number, minute: number): string {
  return hour24ToLabel(hour24, minute);
}

/**
 * Misma convención de texto que las filas del día (`buildHoursLabelsWithOptional30`).
 * Útil para pintar inicio/fin en la franja alineado con las horas creadas.
 */
export function minutesToScheduleLabel(totalMin: number): string {
  const t = ((totalMin % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour24 = Math.floor(t / 60) % 24;
  const minute = t % 60;
  return hour24ToLabelWithMinute(hour24, minute);
}

/** "HH:mm" 24h → etiqueta como en la cuadrícula (misma que `minutesToScheduleLabel`). */
export function time24ToScheduleLabel(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  return minutesToScheduleLabel((h || 0) * 60 + (m || 0));
}

/**
 * Fin del intervalo en minutos para dibujar en la cuadrícula (día / semana).
 * Si fin ≤ inicio (p. ej. 8:00–8:00), se usa inicio + 1 h para que el solape con filas
 * sea correcto y el bloque tenga altura visible.
 */
export function reminderEndMinutesForLayout(startTime: string, endTime?: string | null): number {
  const startMin = timeToMinutes(startTime);
  const rawEnd =
    endTime != null && String(endTime).trim() !== ''
      ? timeToMinutes(endTime)
      : startMin + 60;
  return rawEnd <= startMin ? startMin + 60 : rawEnd;
}

/**
 * Resultado: etiquetas 12h en orden y minutos desde medianoche (24h) para cada fila.
 * Así la vista no interpreta "6:00" como 6 PM cuando el intervalo es 6–11 AM.
 */
export type ScheduleHoursResult = { labels: string[]; minuteValues: number[] };

/**
 * Horas de en punto en el rango, más solo las :30 que hagan falta porque algún
 * evento empiece o termine en :30. Ej: evento 8–9:30 → ['8:00','9:00','9:30'].
 * Devuelve labels y minuteValues para que la vista use la hora 24h correcta (ej. 6:00 = 6 AM).
 */
export function buildHoursLabelsWithOptional30(
  startHour24: number,
  endHour24: number,
  reminderTimes: { startTime: string; endTime?: string | null }[]
): ScheduleHoursResult {
  const base = buildHoursLabels(startHour24, endHour24);
  if (base.length === 0) {
    const def = hour24ToLabel(8);
    return { labels: [def], minuteValues: [8 * 60] };
  }
  const lo = Math.min(startHour24, endHour24);
  const hi = Math.max(startHour24, endHour24);

  // Base full hours del rango
  const points = new Set<number>();
  for (let h = lo; h <= hi; h++) {
    points.add(h * 60);
  }

  // Añade los límites de los recordatorios (inicio/fin) y/o:30 si aplica.
  type TimeRange = { start: number; end: number };
  const ranges: TimeRange[] = [];
  for (const r of reminderTimes) {
    const startParts = r.startTime?.split(':').map(Number);
    if (!startParts || startParts.length < 2) continue;
    const startMin = (startParts[0] || 0) * 60 + (startParts[1] || 0);
    let endMin = startMin + 60;
    if (r.endTime) {
      const endParts = r.endTime.split(':').map(Number);
      if (endParts.length >= 2) {
        endMin = (endParts[0] || 0) * 60 + (endParts[1] || 0);
      }
    }
    if (endMin <= startMin) endMin = startMin + 60;
    ranges.push({ start: startMin, end: endMin });
    points.add(startMin);
    points.add(endMin);
  }

  const keepPoints = new Set<number>();
  for (const point of points) {
    if (point === lo * 60 || point === hi * 60) {
      keepPoints.add(point);
      continue;
    }
    const isHourPoint = point % 60 === 0;
    const isExplicitLimit = ranges.some((range) => range.start === point || range.end === point);

    if (isHourPoint || isExplicitLimit) {
      keepPoints.add(point);
    }
  }

  const sorted = Array.from(keepPoints.values()).sort((a, b) => a - b);

  return {
    labels: sorted.map((min) => {
      const hour24 = Math.floor(min / 60) % 24;
      const minute = min % 60;
      return hour24ToLabelWithMinute(hour24, minute);
    }),
    minuteValues: sorted,
  };
}

/**
 * Rango visible de la agenda (startHour..endHour inclusive, 24h) → horas de inicio/fin del evento "todo el día".
 * Cubre desde la primera fila (lo:00) hasta el final de la última (hi:00 → fin en (hi+1):00; si hi=23 → 23:59).
 */
export function dayVisibleRangeToTimes(startHour24: number, endHour24: number): { startTime: string; endTime: string } {
  const lo = Math.max(0, Math.min(23, Math.min(startHour24, endHour24)));
  const hi = Math.max(0, Math.min(23, Math.max(startHour24, endHour24)));
  const startTime = `${String(lo).padStart(2, '0')}:00`;
  const endNext = hi + 1;
  const endTime = endNext <= 23 ? `${String(endNext).padStart(2, '0')}:00` : '23:59';
  return { startTime, endTime };
}
