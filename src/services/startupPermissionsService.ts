/**
 * Primera apertura: solicita notificaciones y (Android 12+) pantalla de alarmas exactas
 * para reducir retrasos en segundo plano. Solo corre una vez por instalación.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { isExpoGoEnvironment } from '../utils/expoEnvironment';

const STORAGE_KEY = 'agenda_startup_permissions_v1';

let sharedFlow: Promise<void> | null = null;

async function performFirstLaunchPermissions(): Promise<void> {
  if (Platform.OS === 'web' || Platform.OS !== 'android' || isExpoGoEnvironment()) return;

  const done = await AsyncStorage.getItem(STORAGE_KEY);
  if (done === 'true') return;

  const notifee = require('@notifee/react-native').default;
  await notifee.requestPermission({
    alert: true,
    badge: true,
    sound: true,
  });

  try {
    const { ensureAlarmLaunchPermissions } = await import('./localNotificationService');
    await ensureAlarmLaunchPermissions({ force: true });
  } catch {
    /* */
  }

  await AsyncStorage.setItem(STORAGE_KEY, 'true');
}

/**
 * Idempotente; comparte la misma promesa entre llamadas concurrentes.
 */
export async function runStartupPermissionFlow(): Promise<void> {
  if (Platform.OS === 'web' || Platform.OS !== 'android') return;
  if (!sharedFlow) {
    sharedFlow = performFirstLaunchPermissions().finally(() => {
      sharedFlow = null;
    });
  }
  await sharedFlow;
}
