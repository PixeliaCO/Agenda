/**
 * Utilidades para fechas en la agenda.
 * Formato de fecha YYYY-MM-DD para consistencia con APIs y MongoDB.
 */

/** Devuelve la fecha de hoy en YYYY-MM-DD */
export function getTodayISO(): string {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

/** Dado un día de la semana (0 = Lunes, 6 = Domingo), devuelve la fecha YYYY-MM-DD de esa semana relativa a hoy */
export function getDateFromDayIndex(dayIndex: number): string {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Domingo, 1 = Lunes, ...
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Lunes = 0
  const targetMonday = new Date(today);
  targetMonday.setDate(today.getDate() + mondayOffset);
  const target = new Date(targetMonday);
  target.setDate(targetMonday.getDate() + dayIndex);
  return target.getFullYear() + '-' + pad2(target.getMonth() + 1) + '-' + pad2(target.getDate());
}

/** Índice del día de la semana para el selector (0 = Lunes, 6 = Domingo) */
export function getDayIndexFromDate(dateISO: string): number {
  const d = new Date(dateISO + 'T12:00:00');
  const day = d.getDay(); // 0 = Domingo, 1 = Lunes, ...
  return day === 0 ? 6 : day - 1;
}

/** Formatea YYYY-MM-DD a "d Mmm aa" (ej. "8 Ene 26") */
const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export function formatDisplayDate(dateISO: string): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const yearShort = String(y).slice(-2);
  return `${d} ${MONTHS_SHORT[m - 1]} ${yearShort}`;
}

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

/** Formatea para cabecera de semana: "Enero 2026" */
export function formatMonthYearShort(date: Date): string {
  return `${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Formatea la cabecera de semana mostrando uno o dos meses.
 * Si la semana está en un solo mes: "Enero 2026".
 * Si la semana abarca dos meses (ej. 29 Dic - 4 Ene): "Diciembre 2025 - Enero 2026".
 */

export function formatWeekMonthYearRange(sundayOfWeek: Date): string {
  const start = formatMonthYearShort(sundayOfWeek);
  const saturday = new Date(sundayOfWeek);
  saturday.setDate(saturday.getDate() + 6);
  const end = formatMonthYearShort(saturday);
  return start === end ? start : `${start} - ${end}`;
}

/** Domingo de la semana que contiene la fecha (inicio de semana tipo US) */
export function getSundayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

/** Número de semana del año (1-53) para una fecha */
export function getWeekNumber(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const first = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - first.getTime()) / 86400000 - 3 + (first.getDay() + 6) % 7) / 7);
}

/** Array de 7 fechas (YYYY-MM-DD) de domingo a sábado para la semana de la fecha dada */
export function getWeekDates(date: Date): string[] {
  const sunday = getSundayOfWeek(date);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    out.push(d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()));
  }
  return out;
}

/** Día del mes (número) para mostrar en la cabecera de la semana */
export function getDayOfMonth(dateISO: string): number {
  return parseInt(dateISO.slice(8, 10), 10);
}

/** Suma o resta días a una fecha YYYY-MM-DD */
export function addDays(dateISO: string, days: number): string {
  const d = new Date(dateISO + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

/** Fecha del día (0 = Lunes, 6 = Domingo) en la semana que contiene dateISO */
export function getDateForDayIndexInWeek(dateISO: string, dayIndex: number): string {
  const weekDates = getWeekDates(new Date(dateISO + 'T12:00:00'));
  return weekDates[dayIndex === 6 ? 0 : dayIndex + 1];
}

/** Convierte "HH:mm" (24h) a formato 12h para mostrar: "9:45 a. m." / "1:30 p. m." */
export function formatTime12h(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const minStr = (m || 0) < 10 ? '0' + (m || 0) : String(m || 0);
  const period = h < 12 ? 'a. m.' : 'p. m.';
  return `${hour}:${minStr} ${period}`;
}

/** Hora en formato corto 12h para listas: "10:00", "2:00" (sin a. m./p. m.) */
export function formatTime12hShort(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const minStr = (m || 0) < 10 ? '0' + (m || 0) : String(m || 0);
  return `${hour}:${minStr}`;
}

/** Hora en formato 24h para mostrar: "09:45", "13:30" */
export function formatTime24h(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const hour = h ?? 0;
  const min = (m || 0) < 10 ? '0' + (m || 0) : String(m || 0);
  return `${hour < 10 ? '0' + hour : hour}:${min}`;
}

/** Formato corto según tipo: 12h sin periodo ("10:00") o 24h ("10:00") */
export function formatTimeShort(time24: string, use24h: boolean): string {
  return use24h ? formatTime24h(time24) : formatTime12hShort(time24);
}

/** Formato largo según tipo: 12h con a. m./p. m. o 24h */
export function formatTimeDisplay(time24: string, use24h: boolean): string {
  return use24h ? formatTime24h(time24) : formatTime12h(time24);
}

const WEEKDAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Fecha para detalles del evento: "Vie 13/3/26" */
export function formatDateDetails(dateISO: string): string {
  const d = new Date(dateISO + 'T12:00:00');
  const [y, m, day] = dateISO.split('-').map(Number);
  const weekday = WEEKDAY_SHORT[d.getDay()];
  return `${weekday} ${day}/${m}/${String(y).slice(-2)}`;
}

/** Fecha con día de la semana para resumen: "Dom, 8 Mar" */
export function formatDateWithWeekday(dateISO: string): string {
  const d = new Date(dateISO + 'T12:00:00');
  const [y, m, day] = dateISO.split('-').map(Number);
  const weekday = WEEKDAY_SHORT[d.getDay()];
  return `${weekday}, ${day} ${MONTHS_SHORT[m - 1]}`;
}

/** Convierte "HH:mm" (24h) a componentes 12h (hour 1-12, min 0-59, pm) */
export function time24To12(time24: string): { hour: number; min: number; pm: boolean } {
  const [h, m] = time24.split(':').map(Number);
  const hour24 = h ?? 0;
  const min = Math.min(59, Math.max(0, m || 0));
  if (hour24 === 0) return { hour: 12, min, pm: false };
  if (hour24 === 12) return { hour: 12, min, pm: true };
  return { hour: hour24 > 12 ? hour24 - 12 : hour24, min, pm: hour24 >= 12 };
}

/** Convierte componentes 12h a "HH:mm" (24h) */
export function time12To24(hour: number, min: number, pm: boolean): string {
  const m = Math.min(59, Math.max(0, min));
  let h = hour;
  if (hour === 12) h = pm ? 12 : 0;
  else if (pm) h = hour + 12;
  return `${h < 10 ? '0' + h : h}:${m < 10 ? '0' + m : m}`;
}

/** Nombres de mes para vista de mes */
const MONTHS_LONG = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Formatea mes y año para cabecera de vista mes: "Marzo 2026" */
export function formatMonthYearLong(date: Date): string {
  return `${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`;
}

const WEEKDAY_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Fecha completa para detalles: "Viernes, 13 de marzo de 2026" */
export function formatDateFull(dateISO: string): string {
  const d = new Date(dateISO + 'T12:00:00');
  const [y, m, day] = dateISO.split('-').map(Number);
  const weekday = WEEKDAY_LONG[d.getDay()];
  const month = MONTHS_LONG[m - 1];
  return `${weekday}, ${day} de ${month} de ${y}`;
}

/**
 * Celdas del calendario mensual (6 semanas × 7 días, domingo primero).
 * Cada elemento es YYYY-MM-DD o null para celdas vacías (días del mes anterior/siguiente o relleno).
 */
export function getMonthCalendarCells(monthAnchor: Date): (string | null)[] {
  const year = monthAnchor.getFullYear();
  const month = monthAnchor.getMonth();
  const first = new Date(year, month, 1);
  const firstDayOfWeek = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(year + '-' + pad2(month + 1) + '-' + pad2(d));
  }
  while (cells.length < 42) cells.push(null);
  return cells.slice(0, 42);
}
