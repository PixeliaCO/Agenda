/**
 * Lista de categorías del usuario (Personal, Profesional + personalizadas).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { BUILTIN_CATEGORIES, type CategoryItem } from '../constants/categories';

const STORAGE_KEY = 'agenda_categories_v1';

type CategoryStore = {
  items: CategoryItem[] | null;
};

const store: CategoryStore = { items: null };

let hydrated = false;
let hydrating: Promise<void> | null = null;

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function normalizeList(list: unknown): CategoryItem[] | null {
  if (!Array.isArray(list)) return null;
  const builtInNames = new Set(BUILTIN_CATEGORIES.map((c) => c.name));
  const items = list
    .filter((c): c is CategoryItem => !!c && typeof c.name === 'string' && c.name.trim().length > 0)
    .map((c) => ({
      name: c.name.trim(),
      color: typeof c.color === 'string' ? c.color : BUILTIN_CATEGORIES[0].color,
      builtIn: Boolean(c.builtIn) || builtInNames.has(c.name.trim()),
    }));
  return items.length > 0 ? items : null;
}

async function hydrateOnce(): Promise<void> {
  if (hydrated) return;
  if (hydrating) return hydrating;
  hydrating = (async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = safeParseJson<CategoryStore>(raw);
    store.items = normalizeList(parsed?.items);
    hydrated = true;
  })().finally(() => {
    hydrating = null;
  });
  return hydrating;
}

async function persist(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ items: store.items }));
  } catch {
    // mantener memoria si falla disco
  }
}

/** Todas las categorías: guardadas o predeterminadas. */
export async function getAllCategories(): Promise<CategoryItem[]> {
  await hydrateOnce();
  return store.items ?? [...BUILTIN_CATEGORIES];
}

/** Reemplaza la lista completa (desde el modal de edición). */
export async function saveCategories(categories: CategoryItem[]): Promise<void> {
  await hydrateOnce();
  store.items = categories.map((c) => ({
    name: c.name.trim(),
    color: c.color,
    builtIn: Boolean(c.builtIn),
  }));
  await persist();
}

export async function initCategoryStore(): Promise<void> {
  await hydrateOnce();
}
