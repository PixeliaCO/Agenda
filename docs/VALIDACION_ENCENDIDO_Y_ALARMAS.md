# Validación: notificaciones + pantalla apagada / bloqueo (Android)

La app usa **Notifee** con disparadores `AlarmManager` (`SET_ALARM_CLOCK`), **`lightUpScreen`**, **`fullScreenIntent`**, categoría **alarma**, canales con sonido **`res/raw/alert`**, y la **MainActivity** con `showWhenLocked` / `turnScreenOn` (plugin `withAgendaFullScreenAlarm.js`). No hay garantía al 100 % en todos los fabricantes.

## 1. Comprobar en la app

1. Abre **Opciones** y revisa el bloque **Alarmas en Android** (notificaciones, alarmas exactas, canales, triggers, API). Pulsa **Actualizar estado** tras cambiar ajustes del sistema.
2. Si algo falla, usa los botones de Ajustes y luego **Reprogramar todas las alarmas**.
3. Crea un evento con alarma dentro de **2–3 minutos** (anticipación + inicio si aplica).

## 2. Comprobar en el dispositivo

| Comprobación | Dónde |
|--------------|--------|
| Notificaciones permitidas | Ajustes → Apps → Palm → Notificaciones |
| Sonido del canal (anticipación e inicio) | Ajustes → notificaciones de la app: **Inicio del evento (alarma)** y **Anticipación (alarma)**; comparten el mismo archivo `alert.mp3` y uso **Alarma**. |
| Alarmas y recordatorios exactos (Android 12+) | Ajustes → Apps → Palm → Alarmas (o “especial”) |
| Pantalla completa en alarmas (Android 14+, API 34+) | Opciones → *Permitir pantalla completa en alarmas* o Ajustes del sistema equivalente |
| Batería sin restricción agresiva | Detalles de la app → Batería → sin restricción / sin optimizar |
| No molestar / alarmas | Que el modo no bloquee **alarmas** o el canal de la app |

## 3. Pruebas manuales recomendadas

1. **Pantalla apagada, sin bloqueo**: bloquea manualmente, espera la anticipación o la alarma → debe sonar y, en lo posible, encender la pantalla o mostrar heads-up / pantalla completa.
2. **Pantalla apagada + PIN/patrón**: misma prueba; el contenido completo en pantalla de bloqueo depende del canal (`VISIBILITY_PUBLIC`) y del sistema.
3. **Tras actualizar la app**: abre la app una vez y **reprograma** (canales y recursos pueden cambiar).

## 4. Qué revisar si “no suena” o “no enciende”

- **Expo Go**: las alarmas con Notifee **no aplican** (no es el mismo binario que `expo run:android`). Debes instalar la build nativa / dev client en el teléfono.
- **Permiso de notificaciones denegado**: la app no programa nada; revisa Ajustes y el aviso en consola (`[Agenda] Sin permiso de notificaciones…`).
- **Permiso “indeterminado” (`NOT_DETERMINED`)**: antes solo se pedía permiso si el estado era `DENIED`, y se salía sin programar. Ahora se llama a `requestPermission` siempre que no haya **AUTHORIZED** o **PROVISIONAL**.
- Canal creado antes **sin sonido**: Android no actualiza el sonido del canal. **Inicio** (`agenda-event-phone-v5`) y **anticipación** (`agenda-anticipation-phone-v5`) se crean en Kotlin con el **mismo** `Uri` (`res/raw/alert`) y `AudioAttributes` (`USAGE_ALARM`); el plugin sube `SCHEMA_VERSION` a **6** en prebuild para recrear canales si hace falta.
- **Android 14+** sin permiso de pantalla completa: el `fullScreenIntent` puede ignorarse; la notificación puede seguir en la bandeja sin encender pantalla.
- **Fabricante** (Xiaomi, Huawei, etc.): ajustes extra de autostart y batería.
- **Opciones muestra “Canal anticipación: falta” o “Canal inicio: falta”**: ejecuta **`npx expo prebuild`** (o `expo run:android`) para regenerar `AgendaSystemAlarmChannel.kt`, reinstala, abre la app y **Reprogramar todas las alarmas**.
- **`createTriggerNotification` falla en APIs nuevas**: la app reintenta en cadena: (1) UI completa + `SET_ALARM_CLOCK` + insistencia (`FLAG_INSISTENT`) + `lightUpScreen` + pantalla completa; (2) sin `fullScreenIntent`; (3) sin acciones (mantiene FSI + encendido); (4) sin FSI ni acciones (mantiene `lightUpScreen`); (5) WorkManager + sin FSI; (6–7) UI mínima sin insistencia ni `lightUpScreen` como último recurso. En **Android 14+** el encendido fuerte puede requerir permiso de **pantalla completa en alarmas**.
- **Pantalla de bloqueo (alarma)**: el plugin `withAgendaAlarmLockscreen.js` registra `AlarmLockscreenActivity` (flags de ventana + `WakeLock` parcial hasta 2 min al abrir) y el módulo `AgendaAlarmNative` para `fullScreenIntent` + posponer 5 min / deslizar arriba = Ok; requiere prebuild y no aplica en Expo Go.

## 5. “Que funcione en cualquier Android”: qué es razonable y qué no

Ninguna app de agenda puede **garantizar** el mismo encendido de pantalla, heads-up y pantalla completa en **todos** los modelos: Google endurece permisos (p. ej. pantalla completa solo con aprobación explícita del usuario en Android 14+) y cada marca añade **ahorro de batería**, **inicio automático** y reglas distintas para alarmas en segundo plano.

Lo que sí hace esta app es usar la pila recomendada (`SET_ALARM_CLOCK`, categoría alarma, canales con `USAGE_ALARM`, `lightUpScreen`, intent de pantalla completa hacia `AlarmLockscreenActivity`, `showWhenLocked` / `turnScreenOn` en la actividad principal) y **reintentar** si el sistema rechaza parte de la UI. El resto depende de que el usuario complete los ajustes del sistema y del fabricante.

### 5.1 Xiaomi / HyperOS (p. ej. 15T, Android 15–16)

Los menús cambian de nombre entre MIUI/HyperOS; busca equivalentes en **Ajustes → Aplicaciones → Palm** (o el nombre de tu app):

| Objetivo | Dónde suele estar (HyperOS) |
|----------|-----------------------------|
| Inicio automático / autostart | Aplicaciones → Palm → **Autostart** (o “Inicio automático”) → **Activado** |
| Sin matar la app en reposo | Aplicaciones → Palm → **Batería** → **Sin restricciones** (no “Ahorro”) |
| Notificaciones en pantalla de bloqueo | Notificaciones de Palm → **Pantalla de bloqueo** / mostrar contenido sensible si aplica |
| Pantalla completa en alarmas (API 34+) | Desde la app: **Opciones → Permitir pantalla completa en alarmas**; en el sistema, confirma que Palm está **permitida** en la lista de apps con ese permiso |
| Alarmas exactas | Ajustes de la app o “Alarmas y recordatorios” para Palm → **Permitir** |

Después de cambiar cualquiera de estos: abre Palm, pulsa **Reprogramar todas las alarmas** en Opciones y prueba una alarma a **2–3 minutos** con la pantalla apagada.

### 5.2 Otros fabricantes

Misma idea: **notificaciones**, **alarmas exactas**, **batería sin optimizar agresivo**, **pantalla completa en alarmas** (Android 14+), y en Samsung/Oppo/Vivo/realme revisar apartados tipo “permitir actividad en segundo plano” o “apps protegidas”.

## 6. Referencia técnica en el repo

- `src/services/localNotificationService.ts` — payloads Notifee, `getAndroidAlarmWakeDiagnostics()`.
- `plugins/withAgendaFullScreenAlarm.js` — manifest + `MainActivity` `setTurnScreenOn` / `setShowWhenLocked`.
- `plugins/withAgendaSystemAlarmChannel.js` — canales nativos de **inicio** y **anticipación** (mismo `alert` en `res/raw`, `USAGE_ALARM`, `IMPORTANCE_MAX`).
- `plugins/withAgendaAlarmLockscreen.js` — Activity de pantalla completa en bloqueo + puente JS (`agenda:alarm-bridge`).
- `docs/VERIFICACION_ESCENARIOS_ALARMA.md` — matriz app abierta / segundo plano / cerrada / pantalla apagada / bloqueo.
