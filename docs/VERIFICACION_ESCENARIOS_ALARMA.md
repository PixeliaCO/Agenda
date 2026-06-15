# Verificación: anticipación + alarma en todos los estados de la app

Este documento resume **qué hace el código** frente a cada escenario y **qué no puede garantizar** ninguna app (fabricante, ahorro de batería, políticas de Android).

Referencia técnica: `index.ts` (carga `notifeeBackground` antes del registro), `notifeeBackground.ts`, `src/services/localNotificationService.ts`, `plugins/withAgendaSystemAlarmChannel.js`, `plugins/withAgendaFullScreenAlarm.js`, `app.json` (permisos Android).

---

## Matriz por escenario

| Escenario | Comportamiento esperado (código actual) | Requisitos del sistema / notas |
|-----------|----------------------------------------|----------------------------------|
| **App abierta (primer plano)** | Notifee entrega eventos en `onForegroundEvent` (init en `AgendaScreen`). La notificación de alarma puede mostrarse encima de la app; acciones Ok / Eliminar / Posponer se procesan en JS. | Notificaciones permitidas. Volumen de alarma / multimedia según canal. |
| **App en segundo plano** | Los disparadores los entrega **AlarmManager** (nativo). `notifee.onBackgroundEvent` (registrado en `notifeeBackground.ts` al arrancar el bundle) procesa **acciones** al pulsarlas sin tener la app visible. | Mismo que arriba + alarmas exactas si el SO las exige (Android 12+). |
| **App “cerrada” (deslizar recientes)** | Los **triggers ya programados** siguen en el sistema; al vencer la hora, Android muestra la notificación **sin** que la actividad esté abierta. Las acciones pueden arrancar un contexto headless breve para ejecutar el handler. | No usar “forzar cierre” del sistema si el fabricante cancela alarmas de terceros. Alarmas exactas + sin restricción extrema de batería. |
| **Pantalla apagada** | `SET_ALARM_CLOCK`, categoría alarma, `lightUpScreen`, canales nativos con `IMPORTANCE_MAX` y sonido `res/raw/alert` (inicio y anticipación con la misma configuración de audio en Kotlin). | DND no debe silenciar alarmas del canal si quieres sonido; en algunos equipos revisar “alarmas” vs “multimedia”. |
| **Dispositivo bloqueado** | `VISIBILITY_PUBLIC`, `IMPORTANCE_MAX`, `fullScreenIntent` (según política del SO), `showWhenLocked` / `turnScreenOn` en `MainActivity` + manifest (plugin). | **Android 14 (API 34)+**: el usuario debe conceder **pantalla completa en alarmas** para la app (enlace en Opciones). Contenido sensible en pantalla de bloqueo depende del fabricante. |

---

## Qué comprobar en la APK **antes** de dar por buena la build

1. Abre **Opciones** y revisa el bloque **Notificaciones y alarmas**:
   - Notificaciones y alarmas exactas en **OK**.
   - **Canal anticipación** y **canal inicio** en **OK** (si “falta”, el prebuild/plugins no se aplicaron o hubo error al crear canal).
   - **Disparadores pendientes**: tras guardar un evento con alarma en el **futuro**, el número debería ser **> 0**. Si es 0, suele ser permiso denegado, hora ya pasada, o evento sin hora / sin alarma según el flujo.
2. Crea un evento de prueba **dentro de 2–3 minutos** (con anticipación por defecto en eventos nuevos).
3. Prueba en este orden (misma build):
   - App en primer plano → espera anticipación e inicio.
   - Pulsa Home (segundo plano) → repite.
   - Desliza la app en recientes → repite (pantalla apagada / bloqueo en al menos una de las pruebas).
4. Si cambias ajustes del sistema, pulsa **Reprogramar todas las alarmas** en Opciones.

---

## Límites honestos (ninguna app puede “garantizar” al 100 %)

- Fabricantes (Xiaomi, Oppo, Huawei, etc.) pueden retrasar o suprimir alarmas si la app no está en lista blanca de batería o autostart.
- El usuario puede revocar permisos en cualquier momento.
- **Pantalla completa** en Android 14+ es permiso explícito del usuario.
- **Reinicio del teléfono**: las alarmas tipo *alarm clock* suelen persistir; aun así conviene abrir la app una vez tras actualizar o reinstalar.

Para más detalle de ajustes por pantalla, sigue también `VALIDACION_ENCENDIDO_Y_ALARMAS.md`.
