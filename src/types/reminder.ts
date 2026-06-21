/**
 * Tipos para recordatorios de la agenda.
 * Compatibles con un backend en MongoDB (campos _id, fechas, etc.).
 */

/** Unidad del anticipo de la alarma (cuando `alarm` es true) */
export type AlarmUnit = 'minutes' | 'hours' | 'days';

export type Reminder = {
  /** Identificador único (MongoDB usará _id) */
  id: string;
  /** Título del recordatorio */
  title: string;
  /** Descripción opcional */
  description?: string;
  /** Fecha en formato YYYY-MM-DD */
  date: string;
  /** Hora de inicio en formato HH:mm (24h) */
  startTime: string;
  /** Hora de fin en formato HH:mm (24h). Si no se define, se asume 1 hora de duración */
  endTime?: string;
  /** Color del bloque en la agenda (hex). Opcional */
  color?: string;
  /** Alarma activada */
  alarm?: boolean;
  /** Cantidad de unidades antes del inicio del evento (requiere `alarm` true) */
  alarmOffset?: number;
  /** Unidad de `alarmOffset` */
  alarmUnit?: AlarmUnit;
  /** Repetición */
  repeat?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  /** Cada cuántas unidades (días/semanas/meses/años); solo si repeat ≠ none */
  repeatInterval?: number;
  /** Fin de la repetición (AAAA-MM-DD); sin valor = sin fecha límite */
  repeatEndDate?: string;
  /** Días de la semana para repeat=weekly (0=Lun … 6=Dom); omitido = día del evento */
  repeatWeekdays?: number[];
  /** Nota o descripción larga */
  note?: string;
  /** Ubicación del evento (campo del modal Detalles de la cita) */
  location?: string;
  /** Categoría (Palm: "Sin archivar" por defecto) */
  category?: string;
  /** Marcado como confidencial/privado */
  confidential?: boolean;
  /** Sin hora concreta: se muestra arriba de la lista; no programa alarmas por hora */
  noTime?: boolean;
  /** Todo el día (00:00–23:59); se muestra en franja superior; alarma de inicio a las 9:00 ese día */
  allDay?: boolean;
  /** Timestamp de creación (para orden/sync con backend) */
  createdAt?: string;
  /** Timestamp de última actualización */
  updatedAt?: string;
};

export type CreateReminderInput = Omit<Reminder, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};

export type UpdateReminderInput = Partial<Omit<Reminder, 'id' | 'createdAt'>>;
