package com.warrioxproductionss.agendapalm

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.os.Build
import android.util.Log
import org.json.JSONObject

/** Banner heads-up nativo cuando la pantalla está encendida (sustituye la notificación Notifee). */
object AgendaAlarmHeadsUp {
  private const val TAG = "AgendaHeadsUp"

  fun show(ctx: Context, notificationId: String, timeText: String, payloadJson: String) {
    val app = ctx.applicationContext
    val prefs = app.getSharedPreferences("AgendaAlarmPrefs", Context.MODE_PRIVATE)
    prefs.edit()
      .putString("payload_" + notificationId, payloadJson)
      .putString("payload_current_id", notificationId)
      .apply()

    val payload = try {
      JSONObject(payloadJson)
    } catch (_: Exception) {
      JSONObject()
    }
    val channelId = payload.optString("channelId", "agenda-event-phone-v5")
    val eventTitle = payload.optString("displayTitle", payload.optString("titleSnapshot", "Evento"))
    val reminderId = payload.optString("reminderId", "")
    val alarmKind = payload.optString("alarmKind", "start")
    val titleSnapshot = payload.optString("titleSnapshot", "Evento")
    val startTimeSnapshot = payload.optString("startTimeSnapshot", "09:00")
    val dateSnapshot = payload.optString("dateSnapshot", "2000-01-01")

    val nm = app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val bannerAction = app.packageName + ".ALARM_BANNER_ACTION"
    val notifTag = notificationId.hashCode()

    fun actionPending(bridgeAction: String): PendingIntent {
      val intent = Intent(bannerAction).setPackage(app.packageName)
      intent.setClass(app, AgendaAlarmBannerReceiver::class.java)
      intent.putExtra("bridge_action", bridgeAction)
      intent.putExtra("notification_id", notificationId)
      intent.putExtra("reminder_id", reminderId)
      intent.putExtra("alarm_kind", alarmKind)
      intent.putExtra("title_snapshot", titleSnapshot)
      intent.putExtra("start_time_snapshot", startTimeSnapshot)
      intent.putExtra("date_snapshot", dateSnapshot)
      val reqCode = (notificationId + bridgeAction).hashCode()
      return PendingIntent.getBroadcast(
        app,
        reqCode,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(app, channelId)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(app)
    }
    builder
      .setSmallIcon(R.drawable.ic_agenda_alarm)
      .setContentTitle(timeText)
      .setContentText(eventTitle)
      .setCategory(Notification.CATEGORY_ALARM)
      .setOngoing(true)
      .setAutoCancel(false)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setPriority(Notification.PRIORITY_MAX)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      builder.addAction(
        Notification.Action.Builder(
          Icon.createWithResource(app, R.drawable.ic_agenda_snooze),
          "Intermitente",
          actionPending("POSPONER"),
        ).build(),
      )
      builder.addAction(
        Notification.Action.Builder(
          Icon.createWithResource(app, R.drawable.ic_agenda_stop),
          "Borrar",
          actionPending("OK"),
        ).build(),
      )
    }

    Log.d(TAG, "show id=" + notificationId + " tag=" + notifTag + " channel=" + channelId)
    nm.notify(notifTag, builder.build())
  }

  fun dismiss(ctx: Context, notificationId: String) {
    Log.d(TAG, "dismiss id=" + notificationId + " tag=" + notificationId.hashCode())
    val nm = ctx.applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.cancel(notificationId.hashCode())
  }
}
