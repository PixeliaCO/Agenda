package com.warrioxproductionss.agendapalm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

object AgendaSystemAlarmChannel {
  private const val CHANNEL_ID_START = "agenda-event-phone-v5"
  private const val CHANNEL_ID_ANTICIPATION = "agenda-anticipation-phone-v5"
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
