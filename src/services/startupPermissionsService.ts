/**
 * Primera apertura: solicita notificaciones y (Android 12+) pantalla de alarmas exactas
 * para reducir retrasos en segundo plano. Solo corre una vez por instalación.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee from '@notifee/react-native';

const STORAGE_KEY = 'agenda_startup_permissions_v1';

let sharedFlow: Promise<void> | null = null;

async function performFirstLaunchPermissions(): Promise<void> {
  if (Platform.OS === 'web' || Platform.OS !== 'android') return;

  const done = await AsyncStorage.getItem(STORAGE_KEY);
  if (done === 'true') return;

  await notifee.requestPermission({
    alert: true,
    badge: true,
    sound: true,
  });

  if (Platform.Version >= 31) {
    try {
      const IntentLauncher = await import('expo-intent-launcher');
      const Constants = (await import('expo-constants')).default;
      const pkg = Constants.expoConfig?.android?.package;
      if (pkg) {
        await IntentLauncher.startActivityAsync(
          IntentLauncher.ActivityAction.REQUEST_SCHEDULE_EXACT_ALARM,
          { data: `package:${pkg}` }
        );
      }
    } catch {
      /* actividad no disponible en algunos entornos */
    }
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
