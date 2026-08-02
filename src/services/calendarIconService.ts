import { NativeModules, Platform } from 'react-native';

type CalendarIconNative = {
  sync: () => void;
};

const native: CalendarIconNative | undefined = NativeModules.CalendarIcon;

/** Sincroniza el icono de launcher Android con la fecha actual (no-op en iOS / Expo Go). */
export function syncCalendarIcon(): void {
  if (Platform.OS !== 'android') return;
  try {
    native?.sync?.();
  } catch {
    /* módulo ausente fuera de dev client / prebuild */
  }
}
