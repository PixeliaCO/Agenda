/** Categorías por defecto estilo Palm Datebook. */

export type CategoryItem = {
  name: string;
  color: string;
  /** Personal y Profesional no se pueden eliminar. */
  builtIn?: boolean;
};

export const UNCategorized_LABEL = 'Sin archivar';
export const UNCategorized_COLOR = '#d8d8d8';
export const EDIT_CATEGORIES_LABEL = 'Editar categorías';

export const BUILTIN_CATEGORIES: CategoryItem[] = [
  { name: 'Personal', color: '#5b9bd5', builtIn: true },
  { name: 'Profesional', color: '#4caf50', builtIn: true },
];

/** Colores para categorías personalizadas (rotación). */
export const CUSTOM_CATEGORY_COLORS = ['#e67e22', '#9b59b6', '#e74c3c', '#16a085', '#f39c12', '#3498db'];

/** Paleta al elegir color en «Editar categorías». */
export const CATEGORY_PICKER_COLORS = [
  '#5b9bd5',
  '#4caf50',
  '#3498db',
  '#16a085',
  '#8bc34a',
  '#f39c12',
  '#e67e22',
  '#ff5722',
  '#e74c3c',
  '#9b59b6',
  '#795548',
  '#607d8b',
];

export function categoryColor(name: string | undefined, categories: CategoryItem[]): string {
  const trimmed = name?.trim();
  if (!trimmed) return UNCategorized_COLOR;
  const found = categories.find((c) => c.name === trimmed);
  return found?.color ?? CUSTOM_CATEGORY_COLORS[trimmed.length % CUSTOM_CATEGORY_COLORS.length];
}

export function categoryDisplayLabel(value: string | undefined): string {
  return value?.trim() || UNCategorized_LABEL;
}

export function nextCustomColor(existing: CategoryItem[]): string {
  const used = new Set(existing.map((c) => c.color));
  const free = CUSTOM_CATEGORY_COLORS.find((c) => !used.has(c));
  return free ?? CUSTOM_CATEGORY_COLORS[existing.length % CUSTOM_CATEGORY_COLORS.length];
}
