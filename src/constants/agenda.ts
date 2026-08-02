/**
 * Constantes de la agenda.
 * Nombres de días y franjas horarias por defecto.
 */

/** Abreviaturas lunes→domingo (3 letras) para selector y calendarios. */
export const SINGLE_DAY_LETTERS = [
  'lun',
  'mar',
  'mié',
  'jue',
  'vie',
  'sáb',
  'dom',
] as const;

/** Abreviaturas del día (3 letras), lunes a domingo */
export const DAY_LETTERS = [
  'Lun',
  'Mar',
  'Mié',
  'Jue',
  'Vie',
  'Sáb',
  'Dom',
] as const;

/** Abreviaturas del día (3 letras), domingo a sábado (cabeceras tipo calendario US) */
export const WEEK_DAY_LETTERS = [
  'Dom',
  'Lun',
  'Mar',
  'Mié',
  'Jue',
  'Vie',
  'Sáb',
] as const;

/** Horas mostradas en la vista semanal (6:00 a.m. – 10:00 p.m., etiquetas 12h) */
export const WEEK_VIEW_HOURS = [
  '6:00', '7:00', '8:00', '9:00', '10:00', '11:00', '12:00',
  '1:00', '2:00', '3:00', '4:00', '5:00', '6:00', '7:00', '8:00', '9:00', '10:00',
] as const;

/** Franjas horarias mostradas en la vista diaria (6:00 a.m. – 10:00 p.m.) */
export const DEFAULT_HOURS = [
  '6:00', '7:00', '8:00', '9:00', '10:00', '11:00', '12:00',
  '1:00', '2:00', '3:00', '4:00', '5:00', '6:00', '7:00', '8:00', '9:00', '10:00',
] as const;

/** Opciones de hora para formulario de recordatorios (24h), cada 30 min de 06:00 a 22:00 */
export const TIME_OPTIONS_24H: string[] = (() => {
  const out: string[] = [];
  for (let h = 6; h <= 22; h++) {
    out.push(`${h < 10 ? '0' + h : h}:00`);
    if (h < 22) out.push(`${h < 10 ? '0' + h : h}:30`);
  }
  return out;
})();

/** Convierte etiqueta de franja (ej. "9:00", "1:00") a hora 24h ("09:00", "13:00") */
export function slotLabelTo24H(label: string): string {
  const [h, m] = label.split(':').map(Number);
  const hour = h >= 1 && h <= 6 && label.length <= 4 ? h + 12 : h;
  return `${hour < 10 ? '0' + hour : hour}:${m < 10 ? '0' + (m || 0) : m || '00'}`;
}
