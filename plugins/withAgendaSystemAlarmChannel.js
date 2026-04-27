const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const CHANNEL_ID = 'agenda-event-phone-alarm';

/**
 * Crea el canal de notificación de inicio de evento (Android O+) usando el sonido
 * `assets/sounds/alert.mp3` (copiado a res/raw/alert por expo-notifications en prebuild).
 */
function withAgendaSystemAlarmChannel(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const androidRoot = cfg.modRequest.platformProjectRoot;
      const pkg = cfg.android?.package;
      if (!pkg || !androidRoot) {
        return cfg;
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

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build

object AgendaSystemAlarmChannel {
  private const val CHANNEL_ID = "${CHANNEL_ID}"
  private const val PREFS = "agenda_android_alarm_channel"
  private const val KEY_SCHEMA = "event_alarm_channel_schema"
  private const val SCHEMA_VERSION = 2

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val app = context.applicationContext
    val nm = app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    if (prefs.getInt(KEY_SCHEMA, 0) < SCHEMA_VERSION) {
      try {
        nm.deleteNotificationChannel("agenda-event-start")
        nm.deleteNotificationChannel("agenda-event-alarm")
        nm.deleteNotificationChannel(CHANNEL_ID)
      } catch (_: Exception) {
      }
      prefs.edit().putInt(KEY_SCHEMA, SCHEMA_VERSION).apply()
    }

    if (nm.getNotificationChannel(CHANNEL_ID) != null) return

    val soundUri =
      Uri.parse("android.resource://" + app.packageName + "/raw/alert")

    val attrs =
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ALARM)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()

    val channel =
      NotificationChannel(
        CHANNEL_ID,
        "Inicio del evento (alarma)",
        NotificationManager.IMPORTANCE_MAX
      ).apply {
        description = "Suena con el tono de la app (alert.mp3)."
        setSound(soundUri, attrs)
        enableVibration(true)
        setVibrationPattern(longArrayOf(0, 400, 200, 400, 200, 400))
        enableLights(true)
      }
    nm.createNotificationChannel(channel)
  }
}
`;
}

module.exports = withAgendaSystemAlarmChannel;
