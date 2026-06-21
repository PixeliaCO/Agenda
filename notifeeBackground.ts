/**
 * Solo Android: Notifee entrega acciones en segundo plano / headless aquí (bundle cargado al arranque).
 * Debe importarse antes de `registerRootComponent` (ver `index.ts`) para que acciones (Ok, Posponer, etc.)
 * funcionen con la app en segundo plano o recién arrancada por la notificación.
 * Escenarios: `docs/VERIFICACION_ESCENARIOS_ALARMA.md`.
 */
import { Platform } from 'react-native';

import { isExpoGoEnvironment } from './src/utils/expoEnvironment';

if (Platform.OS === 'android' && !isExpoGoEnvironment()) {
  const notifee = require('@notifee/react-native').default;
  const { handleNotifeeBackgroundEvent } = require('./src/services/localNotificationService');

  notifee.onBackgroundEvent(async (event: import('@notifee/react-native').Event) => {
    try {
      await handleNotifeeBackgroundEvent(event);
    } catch (e) {
      console.warn('[Agenda] notifee onBackgroundEvent', e);
    }
  });
}
