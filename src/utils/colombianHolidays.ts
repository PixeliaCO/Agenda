/**
 * Festivos oficiales de Colombia.
 * Incluye los trasladados al lunes por la Ley Emiliani (Ley 51 de 1983)
 * y los que dependen de la fecha de Pascua.
 */

/** Festivos de fecha fija: [mes (1-12), día] */
const FIXED_HOLIDAYS: [number, number][] = [
  [1, 1], // Año Nuevo
  [5, 1], // Día del Trabajo
  [7, 20], // Independencia
  [8, 7], // Batalla de Boyacá
  [12, 8], // Inmaculada Concepción
  [12, 25], // Navidad
];

/** Festivos que se trasladan al lunes siguiente si no caen en lunes: [mes (1-12), día] */
const EMILIANI_HOLIDAYS: [number, number][] = [
  [1, 6], // Reyes Magos
  [3, 19], // San José
  [6, 29], // San Pedro y San Pablo
  [8, 15], // Asunción de la Virgen
  [10, 12], // Día de la Raza
  [11, 1], // Todos los Santos
  [11, 11], // Independencia de Cartagena
];

/** Días respecto al Domingo de Pascua (los tres últimos ya caen en lunes) */
const EASTER_OFFSETS = [
  -3, // Jueves Santo
  -2, // Viernes Santo
  43, // Ascensión del Señor
  64, // Corpus Christi
  71, // Sagrado Corazón
];

const cache = new Map<number, Set<string>>();

function toISO(d: Date): string {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
}

/** Domingo de Pascua (algoritmo gregoriano anónimo) */
function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** Traslada la fecha al lunes siguiente si no cae en lunes */
function moveToMonday(d: Date): Date {
  const jsDay = d.getDay(); // 0 = Domingo, 1 = Lunes, ...
  if (jsDay === 1) return d;
  const out = new Date(d);
  out.setDate(d.getDate() + ((8 - jsDay) % 7));
  return out;
}

/** Conjunto de festivos (YYYY-MM-DD) del año dado */
export function getColombianHolidays(year: number): Set<string> {
  const cached = cache.get(year);
  if (cached) return cached;

  const out = new Set<string>();
  for (const [m, d] of FIXED_HOLIDAYS) out.add(toISO(new Date(year, m - 1, d)));
  for (const [m, d] of EMILIANI_HOLIDAYS) out.add(toISO(moveToMonday(new Date(year, m - 1, d))));
  const easter = getEasterSunday(year);
  for (const offset of EASTER_OFFSETS) {
    out.add(toISO(new Date(year, easter.getMonth(), easter.getDate() + offset)));
  }

  cache.set(year, out);
  return out;
}
