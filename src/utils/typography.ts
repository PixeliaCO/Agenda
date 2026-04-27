/**
 * Tamaños de texto de la app: suma fija al valor base antes de aplicar el escalado
 * de preferencias (pequeño / normal / grande).
 */
export const APP_FONT_SIZE_BUMP = 5;

export function scaledFontSize(baseSize: number, fontScale: number): number {
  return Math.round((baseSize + APP_FONT_SIZE_BUMP) * fontScale);
}
