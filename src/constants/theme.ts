/**
 * Temas claro y oscuro — paleta en tonos azules (fondos fríos, acento índigo/azul).
 */

export type ThemeColors = {
  screenBackground: string;
  barBackground: string;
  barBorder: string;
  daySelectedBg: string;
  iconActive: string;
  text: string;
  textSecondary: string;
  placeholder: string;
  line: string;
  reminderDefault: string;
  reminderAlt1: string;
  reminderAlt2: string;
  reminderAlt3: string;
  cardBackground: string;
  backdrop: string;
  todayCellBg: string;
  pressedBg: string;
  /** Pestaña / chip inactivo */
  chipIdleBg: string;
  chipIdleText: string;
  /** Cabecera oscura (modales) */
  palmHeaderBg: string;
  palmHeaderText: string;
  /** Botones secundarios (pie modales) */
  palmMintBg: string;
  palmMintBorder: string;
  /** Borde marcado (cajas resumen) */
  strongBorder: string;
  /** Texto sobre acentos (pestaña activa, botón primario) */
  onAccentBg: string;
  /** Fondo de campos sobre tarjetas (inputs) */
  fieldFill: string;
};

/** Claro: gris azulado suave, barras azul acero, acento azul intenso */
export const lightTheme: ThemeColors = {
  screenBackground: '#e8eef6',
  barBackground: '#9bb4d4',
  barBorder: '#6d8ab0',
  daySelectedBg: '#2563eb',
  iconActive: '#1e3a5f',
  text: '#152238',
  textSecondary: '#4a5f78',
  placeholder: '#6b7f95',
  line: '#c5d4e6',
  reminderDefault: '#1e5a8a',
  reminderAlt1: '#2d7d9a',
  reminderAlt2: '#4a6eb5',
  reminderAlt3: '#5b8fc9',
  cardBackground: '#f4f8fc',
  backdrop: 'rgba(21, 34, 56, 0.48)',
  todayCellBg: '#d4e6f8',
  pressedBg: 'rgba(30, 73, 118, 0.08)',
  chipIdleBg: '#a3bdd9',
  chipIdleText: '#152238',
  palmHeaderBg: '#1a365d',
  palmHeaderText: '#f0f6fc',
  palmMintBg: '#b8d4f0',
  palmMintBorder: '#1a365d',
  strongBorder: '#243b53',
  onAccentBg: '#ffffff',
  fieldFill: '#ffffff',
};

/** Oscuro: azul marino / pizarra, acentos cielo */
export const darkTheme: ThemeColors = {
  screenBackground: '#0f172a',
  barBackground: '#1e293b',
  barBorder: '#334155',
  daySelectedBg: '#3b82f6',
  iconActive: '#93c5fd',
  text: '#f1f5f9',
  textSecondary: '#94a3b8',
  placeholder: '#64748b',
  line: '#334155',
  reminderDefault: '#60a5fa',
  reminderAlt1: '#38bdf8',
  reminderAlt2: '#818cf8',
  reminderAlt3: '#7dd3fc',
  cardBackground: '#1e293b',
  backdrop: 'rgba(0, 0, 0, 0.72)',
  todayCellBg: '#1e3a5f',
  pressedBg: 'rgba(241, 245, 249, 0.09)',
  chipIdleBg: '#334155',
  chipIdleText: '#f1f5f9',
  palmHeaderBg: '#0c1929',
  palmHeaderText: '#f1f5f9',
  palmMintBg: '#3d5a80',
  palmMintBorder: '#94a3b8',
  strongBorder: '#94a3b8',
  onAccentBg: '#ffffff',
  fieldFill: '#0f172a',
};

export const colors = lightTheme;
