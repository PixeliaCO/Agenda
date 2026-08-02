package com.warrioxproductionss.agendapalm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject

class AgendaAlarmBannerReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent == null) return
    val action = intent.getStringExtra("bridge_action") ?: return
    val notificationId = intent.getStringExtra("notification_id") ?: ""
    val reminderId = intent.getStringExtra("reminder_id") ?: return
    val alarmKind = intent.getStringExtra("alarm_kind") ?: return
    val titleSnapshot = intent.getStringExtra("title_snapshot") ?: "Evento"
    val startTimeSnapshot = intent.getStringExtra("start_time_snapshot") ?: "09:00"
    val dateSnapshot = intent.getStringExtra("date_snapshot") ?: "2000-01-01"

    Log.d("AgendaHeadsUp", "receiver action=" + action + " id=" + notificationId)
    AgendaAlarmHeadsUp.dismiss(context, notificationId)
    AgendaAlarmSound.stop(context.applicationContext)

    // Reprogramar: unica accion que abre la app (para editar el evento). El banner es un receiver
    // y no trae la app al frente; hay que lanzarla con los extras del bridge, como la Lock Screen.
    // Se encola tambien como pending_action por si el emit en vivo se pierde en un arranque en frio.
    if (action == "REPROGRAMAR") {
      Log.d("AgendaHeadsUp", "banner REPROGRAMAR reminderId=" + reminderId + " alarmKind=" + alarmKind)
      enqueuePendingAction(context, action, reminderId, alarmKind, notificationId, titleSnapshot, startTimeSnapshot, dateSnapshot)
      launchAppWithAction(context, action, reminderId, alarmKind, notificationId, titleSnapshot, startTimeSnapshot, dateSnapshot)
      return
    }

    if (!deliverToJs(context, action, reminderId, alarmKind, notificationId, titleSnapshot, startTimeSnapshot, dateSnapshot)) {
      enqueuePendingAction(context, action, reminderId, alarmKind, notificationId, titleSnapshot, startTimeSnapshot, dateSnapshot)
    }
  }

  private fun launchAppWithAction(
    context: Context,
    action: String,
    reminderId: String,
    alarmKind: String,
    notificationId: String,
    titleSnapshot: String,
    startTimeSnapshot: String,
    dateSnapshot: String,
  ) {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
    if (launch == null) {
      Log.w("AgendaHeadsUp", "launchAppWithAction: getLaunchIntentForPackage=null, no se pudo abrir la app")
      return
    }
    launch.addFlags(
      Intent.FLAG_ACTIVITY_NEW_TASK or
        Intent.FLAG_ACTIVITY_CLEAR_TOP or
        Intent.FLAG_ACTIVITY_SINGLE_TOP
    )
    launch.putExtra(AgendaAlarmMainActivityBridge.EXTRA_ACTION, action)
    launch.putExtra(AgendaAlarmMainActivityBridge.EXTRA_REMINDER_ID, reminderId)
    launch.putExtra(AgendaAlarmMainActivityBridge.EXTRA_ALARM_KIND, alarmKind)
    launch.putExtra(AgendaAlarmMainActivityBridge.EXTRA_NOTIF_ID, notificationId)
    launch.putExtra(AgendaAlarmMainActivityBridge.EXTRA_TITLE_SNAPSHOT, titleSnapshot)
    launch.putExtra(AgendaAlarmMainActivityBridge.EXTRA_START_TIME_SNAPSHOT, startTimeSnapshot)
    launch.putExtra(AgendaAlarmMainActivityBridge.EXTRA_DATE_SNAPSHOT, dateSnapshot)
    Log.d("AgendaHeadsUp", "launchAppWithAction extras action=" + action + " reminderId=" + reminderId)
    context.startActivity(launch)
  }

  private fun deliverToJs(
    context: Context,
    action: String,
    reminderId: String,
    alarmKind: String,
    notificationId: String,
    titleSnapshot: String,
    startTimeSnapshot: String,
    dateSnapshot: String,
  ): Boolean {
    val app = context.applicationContext as? ReactApplication ?: return false
    val mgr = app.reactNativeHost.reactInstanceManager
    val existing = mgr.currentReactContext
    if (existing != null) {
      emit(existing, action, reminderId, alarmKind, notificationId, titleSnapshot, startTimeSnapshot, dateSnapshot)
      return true
    }
    return try {
      mgr.addReactInstanceEventListener(object : com.facebook.react.ReactInstanceManager.ReactInstanceEventListener {
        override fun onReactContextInitialized(ctx: ReactContext) {
          emit(ctx, action, reminderId, alarmKind, notificationId, titleSnapshot, startTimeSnapshot, dateSnapshot)
          mgr.removeReactInstanceEventListener(this)
        }
      })
      if (!mgr.hasStartedCreatingInitialContext()) {
        mgr.createReactContextInBackground()
      }
      true
    } catch (_: Exception) {
      false
    }
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
    ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("agenda:alarm-bridge", map)
  }

  private fun enqueuePendingAction(
    context: Context,
    action: String,
    reminderId: String,
    alarmKind: String,
    notificationId: String,
    titleSnapshot: String,
    startTimeSnapshot: String,
    dateSnapshot: String,
  ) {
    try {
      val prefs = context.applicationContext.getSharedPreferences("AgendaAlarmPrefs", Context.MODE_PRIVATE)
      val arr = try {
        JSONArray(prefs.getString("pending_actions", "[]") ?: "[]")
      } catch (_: Exception) {
        JSONArray()
      }
      val obj = JSONObject()
      obj.put("action", action)
      obj.put("reminderId", reminderId)
      obj.put("alarmKind", alarmKind)
      obj.put("notificationId", notificationId)
      obj.put("titleSnapshot", titleSnapshot)
      obj.put("startTimeSnapshot", startTimeSnapshot)
      obj.put("dateSnapshot", dateSnapshot)
      arr.put(obj)
      prefs.edit().putString("pending_actions", arr.toString()).apply()
      Log.d("AgendaHeadsUp", "enqueuePendingAction guardado action=" + action + " reminderId=" + reminderId + " total=" + arr.length())
    } catch (e: Exception) {
      Log.w("AgendaHeadsUp", "enqueuePendingAction fallo: " + e.message)
    }
  }
}
