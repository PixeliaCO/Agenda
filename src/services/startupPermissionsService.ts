/**
 * Primera apertura: solicita notificaciones y (Android 12+) pantalla de alarmas exactas
 * para reducir retrasos en segundo plano. Solo corre una vez por instalación.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const STORAGE_KEY = 'agenda_startup_permissions_v1';

let sharedFlow: Promise<void> | null = null;

async function performFirstLaunchPermissions(): Promise<void> {
  if (Platform.OS === 'web') return;

  const done = await AsyncStorage.getItem(STORAGE_KEY);
  if (done === 'true') return;

  await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });

  if (Platform.OS === 'android' && Platform.Version >= 31) {
    try {
      const IntentLauncher = await import('expo-intent-launcher');
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.REQUEST_SCHEDULE_EXACT_ALARM
      );
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
  if (Platform.OS === 'web') return;
  if (!sharedFlow) {
    sharedFlow = performFirstLaunchPermissions().finally(() => {
      sharedFlow = null;
    });
  }
  await sharedFlow;
}
