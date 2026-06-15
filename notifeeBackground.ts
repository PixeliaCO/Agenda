/**
 * Solo Android: Notifee entrega acciones en segundo plano / headless aquí (bundle cargado al arranque).
 * Debe importarse antes de `registerRootComponent` (ver `index.ts`) para que acciones (Ok, Posponer, etc.)
 * funcionen con la app en segundo plano o recién arrancada por la notificación.
 * Escenarios: `docs/VERIFICACION_ESCENARIOS_ALARMA.md`.
 */
import { Platform } from 'react-native';
import notifee from '@notifee/react-native';

import { handleNotifeeBackgroundEvent } from './src/services/localNotificationService';

if (Platform.OS === 'android') {
  notifee.onBackgroundEvent(async (event) => {
    try {
      await handleNotifeeBackgroundEvent(event);
    } catch (e) {
      console.warn('[Agenda] notifee onBackgroundEvent', e);
    }
  });
}
