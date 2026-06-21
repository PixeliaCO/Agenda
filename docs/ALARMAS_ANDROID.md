# Notificaciones y alarmas en Android

> **Alcance actual:** la app programa alarmas locales con **Notifee solo en Android**. En iOS no se programan notificaciones desde este flujo.

En Android, las notificaciones locales dependen del sistema y del fabricante. Si los avisos **no suenan**, **llegan con retraso** o **solo aparecen con la app abierta**, suele deberse a una combinación de permisos, alarmas exactas y ahorro de batería.

## Qué hace la app

- Pide **notificaciones** y, cuando aplica, **alarmas exactas** (`SCHEDULE_EXACT_ALARM`) para acercarse a la hora programada.
- Al **volver a primer plano** (por ejemplo tras salir de Ajustes), la app **reprograma** las notificaciones según los eventos guardados.
- En **Opciones** hay atajos a ajustes del sistema y un botón **Reprogramar todas las alarmas**.
- **Notifee** (`@notifee/react-native`) para notificaciones locales y disparadores (alarmas exactas en Android vía `AlarmManager`). Requiere **prebuild** y **build nativo** (dev client o `expo run:android`); **no** está soportado en Expo Go.
- Plugin `withAgendaFullScreenAlarm.js`: **MainActivity** con `showWhenLocked` / `turnScreenOn`. Permiso **`USE_FULL_SCREEN_INTENT`** en el manifest. Notifee configura **`fullScreenIntent`** en la notificación de inicio.

## Ajustes globales de alarma (Opciones)

En **Opciones → Alarmas** (Android) puedes configurar:

- **Posponer** — minutos para «Recordar nuevamente» (por defecto 5).
- **Re-sonido** — intervalo entre re-sonidos automáticos si no respondes (por defecto 5 min).
- **Repetir** — cuántas veces más vuelve a sonar tras el primer aviso (por defecto 4; 0 = solo una vez).

Al guardar, la app **reprograma** las alarmas futuras con esos valores.

## Posponer (Recordar nuevamente)

El aviso pospuesto usa el id `agenda-p-…` o `agenda-ap-…`. Un **resync** al volver a la app **no** lo cancela; al **guardar cambios** en el evento sí se cancelan todas las notificaciones de ese evento (incluido el pospuesto), para no dejar alarmas obsoletas.

## Completado y reprogramar

- **Completado** detiene la alarma y la cadena de re-sonidos; la ocurrencia queda registrada para no volver a programarse al abrir la app.
- **Reprogramar** abre el selector de hora del evento; también detiene la alarma actual hasta que guardes la nueva hora.

## Pantalla de bloqueo (estilo Palm)

Con pantalla apagada o bloqueada, la alarma puede mostrar **AlarmLockscreenActivity**: cabecera azul, botones Completado / Reprogramar / Recordar (minutos según Opciones). Requiere permiso de **pantalla completa** en Android 14+.

## Pantalla completa / encender pantalla (Android 12+)

En **Android 14 (API 34)** el usuario debe permitir en sistema que la app use **intents de pantalla completa**; en la app: **Opciones → Permitir pantalla completa en alarmas**. Si no se concede, el sistema suele **ignorar** `setFullScreenIntent` y la pantalla no se enciende aunque el manifest lo declare.

## Botones en la notificación (Completado / Reprogramar / Recordar nuevamente)

Con **tres acciones**, muchos lanzadores (Material 3 / fabricantes) solo muestran todas al **expandir** la notificación o con gesto largo; es comportamiento del sistema, no específico de Notifee.

## Checklist en el dispositivo

1. **Notificaciones activadas** para la app (canal con sonido, no solo “silencioso”).
2. **Alarmas exactas** permitidas para esta app (Android 12+; el nombre exacto varía según la marca).
3. **Sin restricción de batería** (o “sin optimizar”) para la app: Ajustes → Apps → [tu app] → Batería.
4. **No molestar**: comprobar que no bloquea alarmas o el canal que usa la app.
5. Tras cambiar cualquiera de lo anterior, abre la app un momento o pulsa **Reprogramar todas las alarmas** en Opciones.

## Limitaciones conocidas

- Algunos fabricantes **retrasan** tareas en segundo plano de forma agresiva; no hay garantía al 100% sin la colaboración del usuario en Ajustes.
- Hay un **límite** de disparadores programados por evento en el código; eventos con muchas repeticiones lejanas pueden no cubrir todas las ocurrencias (la app programa un subconjunto razonable).

## Pruebas antes de publicar en Play

Tras cambiar permisos o plugins nativos, genera un **AAB de release** e instálalo en un dispositivo real (no solo Expo Go), crea un evento en 2–3 minutos y bloquea la pantalla.
