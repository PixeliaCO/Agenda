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
  /** Fondo de pantallas apiladas (detalles, opciones, ir a fecha…) */
  viewScreenBackground: string;
  /** Barra de título Palm: fondo gris claro; el selector de días va sobre este fondo */
  agendaHeaderBg: string;
  /** Letras y flechas del selector (negro Palm) */
  agendaHeaderText: string;
  /** Divisores finos entre celdas del selector */
  agendaHeaderBorder: string;
  /** Día seleccionado en la barra de letras (fondo azul, texto blanco) */
  agendaHeaderSelectedBg: string;
  agendaHeaderSelectedText: string;
  /** Recuadro azul de la fecha ("8 Ene 26") */
  agendaDateChipBg: string;
  agendaDateChipText: string;
  /** Línea azul sólida bajo la cabecera (y borde del grid) */
  agendaHeaderRule: string;
  /** Barra inferior gris retro (Palm) */
  footerBg: string;
  footerBorder: string;
  footerText: string;
  /** Bisel de botones retro (luz arriba-izq, sombra abajo-der) */
  footerBevelLight: string;
  footerBevelDark: string;
};

/** Claro: fondo blanco, barras azul acero, acento azul intenso */
export const lightTheme: ThemeColors = {
  screenBackground: '#ffffff',
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
  cardBackground: '#ffffff',
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
  viewScreenBackground: '#ffffff',
  agendaHeaderBg: '#ffffff',
  agendaHeaderText: '#15233a',
  agendaHeaderBorder: '#5a6b85',
  agendaHeaderSelectedBg: '#1332f6',
  agendaHeaderSelectedText: '#ffffff',
  agendaDateChipBg: '#1332f6',
  agendaDateChipText: '#ffffff',
  agendaHeaderRule: '#1332f6',
  footerBg: '#c3c3c3',
  footerBorder: '#888888',
  footerText: '#1a1a1a',
  footerBevelLight: '#ffffff',
  footerBevelDark: '#888888',
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
  viewScreenBackground: '#1e293b',
  agendaHeaderBg: '#1e293b',
  agendaHeaderText: '#e2e8f0',
  agendaHeaderBorder: '#64748b',
  agendaHeaderSelectedBg: '#3b82f6',
  agendaHeaderSelectedText: '#ffffff',
  agendaDateChipBg: '#1d4ed8',
  agendaDateChipText: '#ffffff',
  agendaHeaderRule: '#3b82f6',
  footerBg: '#2b3444',
  footerBorder: '#475569',
  footerText: '#e2e8f0',
  footerBevelLight: '#475569',
  footerBevelDark: '#0c1019',
};

export const colors = lightTheme;
