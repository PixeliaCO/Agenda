package com.warrioxproductionss.agendapalm

import android.app.Activity
import android.content.Intent
import android.util.Log
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.DeviceEventManagerModule

object AgendaAlarmMainActivityBridge {
  val EXTRA_ACTION = "agenda_alarm_bridge_action"
  val EXTRA_REMINDER_ID = "agenda_alarm_bridge_reminder_id"
  val EXTRA_ALARM_KIND = "agenda_alarm_bridge_alarm_kind"
  val EXTRA_NOTIF_ID = "agenda_alarm_bridge_notification_id"
  val EXTRA_TITLE_SNAPSHOT = "agenda_alarm_bridge_title_snapshot"
  val EXTRA_START_TIME_SNAPSHOT = "agenda_alarm_bridge_start_time_snapshot"
  val EXTRA_DATE_SNAPSHOT = "agenda_alarm_bridge_date_snapshot"

  fun dispatchFromIntent(activity: Activity, intent: Intent?) {
    if (intent == null) {
      Log.d("AgendaAlarmBridge", "dispatchFromIntent: intent=null")
      return
    }
    val action = intent.getStringExtra(EXTRA_ACTION)
    if (action == null) {
      Log.d("AgendaAlarmBridge", "dispatchFromIntent: sin EXTRA_ACTION, no-op")
      return
    }
    val reminderId = intent.getStringExtra(EXTRA_REMINDER_ID)
    if (reminderId == null) {
      Log.w("AgendaAlarmBridge", "dispatchFromIntent: sin EXTRA_REMINDER_ID, no-op action=" + action)
      return
    }
    val alarmKind = intent.getStringExtra(EXTRA_ALARM_KIND)
    if (alarmKind == null) {
      Log.w("AgendaAlarmBridge", "dispatchFromIntent: sin EXTRA_ALARM_KIND, no-op action=" + action)
      return
    }
    val notificationId = intent.getStringExtra(EXTRA_NOTIF_ID) ?: ""
    val titleSnapshot = intent.getStringExtra(EXTRA_TITLE_SNAPSHOT) ?: "Evento"
    val startTimeSnapshot = intent.getStringExtra(EXTRA_START_TIME_SNAPSHOT) ?: "09:00"
    val dateSnapshot = intent.getStringExtra(EXTRA_DATE_SNAPSHOT) ?: "2000-01-01"

    Log.d("AgendaAlarmBridge", "dispatchFromIntent action=" + action + " reminderId=" + reminderId + " alarmKind=" + alarmKind)
    intent.removeExtra(EXTRA_ACTION)

    val app = activity.application as? ReactApplication
    if (app == null) {
      Log.w("AgendaAlarmBridge", "dispatchFromIntent: application no es ReactApplication, no-op")
      return
    }
    val mgr = app.reactNativeHost.reactInstanceManager
    val existing = mgr.currentReactContext
    if (existing != null) {
      Log.d("AgendaAlarmBridge", "dispatchFromIntent: reactContext ya listo, emit inmediato")
      emit(existing, action, reminderId, alarmKind, notificationId, titleSnapshot, startTimeSnapshot, dateSnapshot)
      return
    }
    Log.d("AgendaAlarmBridge", "dispatchFromIntent: reactContext no listo, difiriendo con ReactInstanceEventListener")
    val listener = object : com.facebook.react.ReactInstanceManager.ReactInstanceEventListener {
      override fun onReactContextInitialized(context: ReactContext) {
        Log.d("AgendaAlarmBridge", "onReactContextInitialized: emitiendo action=" + action + " reminderId=" + reminderId)
        emit(context, action, reminderId, alarmKind, notificationId, titleSnapshot, startTimeSnapshot, dateSnapshot)
        mgr.removeReactInstanceEventListener(this)
      }
    }
    mgr.addReactInstanceEventListener(listener)
  }

  private fun emit(
    ctx: ReactContext,
    action: String,
    reminderId: String,
    alarmKind: String,
    notificationId: String,
    titleSnapshot: String,
    startTimeSnapshot: String,
    dateSnapshot: String,
  ) {
    val map = Arguments.createMap()
    map.putString("action", action)
    map.putString("reminderId", reminderId)
    map.putString("alarmKind", alarmKind)
    map.putString("notificationId", notificationId)
    map.putString("titleSnapshot", titleSnapshot)
    map.putString("startTimeSnapshot", startTimeSnapshot)
    map.putString("dateSnapshot", dateSnapshot)
    Log.d("AgendaAlarmBridge", "emit agenda:alarm-bridge action=" + action + " reminderId=" + reminderId)
    ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("agenda:alarm-bridge", map)
  }
}
