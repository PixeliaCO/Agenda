const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const CHANNEL_ID_START = 'agenda-event-phone-v5';
const CHANNEL_ID_ANTICIPATION = 'agenda-anticipation-phone-v5';

/**
 * Copia `assets/sounds/alert.mp3` a `res/raw/alert.mp3` y crea canales nativos (Android O+).
 * Los canales son SILENCIOSOS: el sonido lo reproduce AlarmLockscreenActivity (MediaPlayer,
 * USAGE_ALARM). La notificación solo actúa como lanzador de la Lock Screen (fullScreenIntent),
 * por eso conserva IMPORTANCE_MAX pero sin sonido.
 */
function withAgendaSystemAlarmChannel(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const androidRoot = cfg.modRequest.platformProjectRoot;
      const projectRoot = cfg.modRequest.projectRoot;
      const pkg = cfg.android?.package;
      if (!pkg || !androidRoot) {
        return cfg;
      }

      const rawDir = path.join(androidRoot, 'app', 'src', 'main', 'res', 'raw');
      const srcSound = path.join(projectRoot, 'assets', 'sounds', 'alert.mp3');
      const destSound = path.join(rawDir, 'alert.mp3');
      try {
        if (fs.existsSync(srcSound)) {
          fs.mkdirSync(rawDir, { recursive: true });
          fs.copyFileSync(srcSound, destSound);
        }
      } catch {
        /* prebuild sin asset */
      }

      const pkgPath = pkg.replace(/\./g, path.sep);
      const javaDir = path.join(androidRoot, 'app', 'src', 'main', 'java', pkgPath);
      fs.mkdirSync(javaDir, { recursive: true });

      const helperPath = path.join(javaDir, 'AgendaSystemAlarmChannel.kt');
      fs.writeFileSync(helperPath, makeHelperKotlin(pkg), 'utf8');

      const mainAppPath = path.join(javaDir, 'MainApplication.kt');
      if (!fs.existsSync(mainAppPath)) {
        return cfg;
      }

      let main = fs.readFileSync(mainAppPath, 'utf8');
      if (main.includes('AgendaSystemAlarmChannel.ensureChannel')) {
        return cfg;
      }

      const hook = 'ApplicationLifecycleDispatcher.onApplicationCreate(this)';
      if (!main.includes(hook)) {
        throw new Error(
          'withAgendaSystemAlarmChannel: no se encontró ApplicationLifecycleDispatcher.onApplicationCreate en MainApplication'
        );
      }
      main = main.replace(
        hook,
        `AgendaSystemAlarmChannel.ensureChannel(this)\n    ${hook}`
      );

      fs.writeFileSync(mainAppPath, main, 'utf8');
      return cfg;
    },
  ]);
}

/** @param {string} packageName */
function makeHelperKotlin(packageName) {
  return `package ${packageName}

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

object AgendaSystemAlarmChannel {
  private const val CHANNEL_ID_START = "${CHANNEL_ID_START}"
  private const val CHANNEL_ID_ANTICIPATION = "${CHANNEL_ID_ANTICIPATION}"
  private const val PREFS = "agenda_android_alarm_channel"
  private const val KEY_SCHEMA = "event_alarm_channel_schema"
  private const val SCHEMA_VERSION = 9

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val app = context.applicationContext
    val nm = app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    if (prefs.getInt(KEY_SCHEMA, 0) < SCHEMA_VERSION) {
      try {
        nm.deleteNotificationChannel("agenda-event-start")
        nm.deleteNotificationChannel("agenda-event-alarm")
        nm.deleteNotificationChannel("agenda-event-phone-alarm")
        nm.deleteNotificationChannel("agenda-event-phone-alarm-v4")
        nm.deleteNotificationChannel(CHANNEL_ID_START)
        nm.deleteNotificationChannel(CHANNEL_ID_ANTICIPATION)
        nm.deleteNotificationChannel("agenda-anticipation-v5")
      } catch (_: Exception) {
      }
      prefs.edit().putInt(KEY_SCHEMA, SCHEMA_VERSION).apply()
    }

    // Canales SILENCIOSOS y sin vibración: el sonido/vibración los reproduce AgendaAlarmSound
    // (MediaPlayer en bucle, USAGE_ALARM). Si el canal también sonara, se oirían dos alarmas a la vez.
    if (nm.getNotificationChannel(CHANNEL_ID_START) == null) {
      val startChannel =
        NotificationChannel(
          CHANNEL_ID_START,
          "Inicio del evento (alarma)",
          NotificationManager.IMPORTANCE_MAX
        ).apply {
          description = "Alarma de inicio; pantalla completa (el tono lo reproduce la app)."
          setSound(null, null)
          enableVibration(false)
          enableLights(true)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            setBypassDnd(true)
          }
        }
      nm.createNotificationChannel(startChannel)
    }

    if (nm.getNotificationChannel(CHANNEL_ID_ANTICIPATION) == null) {
      val antChannel =
        NotificationChannel(
          CHANNEL_ID_ANTICIPATION,
          "Anticipación (alarma)",
          NotificationManager.IMPORTANCE_MAX
        ).apply {
          description = "Alarma de anticipación; pantalla completa (el tono lo reproduce la app)."
          setSound(null, null)
          enableVibration(false)
          enableLights(true)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            setBypassDnd(true)
          }
        }
      nm.createNotificationChannel(antChannel)
    }
  }
}
`;
}

module.exports = withAgendaSystemAlarmChannel;
