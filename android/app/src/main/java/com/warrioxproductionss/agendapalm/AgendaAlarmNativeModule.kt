package com.warrioxproductionss.agendapalm

import android.app.ActivityOptions
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AgendaAlarmNativeModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "AgendaAlarmNative"

  @ReactMethod
  fun primeLockScreenPayload(notificationId: String, payloadJson: String) {
    reactApplicationContext
      .getSharedPreferences("AgendaAlarmPrefs", Context.MODE_PRIVATE)
      .edit()
      .putString("payload_" + notificationId, payloadJson)
      .apply()
  }

  /** Marca qué payload debe usar la Lock Screen al dispararse (no al programar). */
  @ReactMethod
  fun activateLockScreenPayload(notificationId: String) {
    if (notificationId.isBlank()) return
    reactApplicationContext
      .getSharedPreferences("AgendaAlarmPrefs", Context.MODE_PRIVATE)
      .edit()
      .putString("payload_current_id", notificationId)
      .apply()
  }

  /** ¿Tiene permiso "Mostrar sobre otras apps"? Exime de las restricciones de lanzar actividad en segundo plano. */
  @ReactMethod
  fun canDrawOverlays(promise: com.facebook.react.bridge.Promise) {
    try {
      val ok = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M)
        android.provider.Settings.canDrawOverlays(reactApplicationContext) else true
      promise.resolve(ok)
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }

  /** ¿Pantalla encendida e interactiva? (false = pantalla apagada → solo Lock Screen). */
  @ReactMethod
  fun isScreenInteractive(promise: com.facebook.react.bridge.Promise) {
    try {
      val pm = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
      promise.resolve(pm.isInteractive)
    } catch (e: Exception) {
      promise.resolve(true)
    }
  }

  /** Lanza AlarmLockscreenActivity; en API 34+ usa PendingIntent con permiso de inicio en background. */
  @ReactMethod
  fun launchLockScreenActivity(notificationId: String?) {
    val ctx = reactApplicationContext.applicationContext
    val prefs = ctx.getSharedPreferences("AgendaAlarmPrefs", Context.MODE_PRIVATE)
    val notifId =
      notificationId?.takeIf { it.isNotBlank() }
        ?: prefs.getString("payload_current_id", null)
        ?: "unknown"
    if (notifId.isNotBlank() && notifId != "unknown") {
      prefs.edit().putString("payload_current_id", notifId).apply()
    }
    val intent = Intent(ctx, AlarmLockscreenActivity::class.java)
    if (notifId.isNotBlank() && notifId != "unknown") {
      intent.putExtra(AlarmLockscreenActivity.EXTRA_NOTIFICATION_ID, notifId)
    }
    intent.addFlags(
      Intent.FLAG_ACTIVITY_NEW_TASK or
        Intent.FLAG_ACTIVITY_CLEAR_TOP or
        Intent.FLAG_ACTIVITY_SINGLE_TOP
    )
    val piFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    val pi = PendingIntent.getActivity(ctx, 9001, intent, piFlags)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        val opts = ActivityOptions.makeBasic()
        opts.setPendingIntentBackgroundActivityStartMode(
          ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED
        )
        pi.send(null, 0, null, null, null, null, opts.toBundle())
      } else {
        pi.send()
      }
    } catch (_: Exception) {
      try {
        ctx.startActivity(intent)
      } catch (_: Exception) {
      }
    }
  }

  @ReactMethod
  fun canUseFullScreenIntent(promise: com.facebook.react.bridge.Promise) {
    try {
      val ok = if (Build.VERSION.SDK_INT >= 34) {
        val nm = reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.canUseFullScreenIntent()
      } else true
      promise.resolve(ok)
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }

  /** Reproduce alert.mp3 en bucle (banner sin Lock Screen visible). */
  @ReactMethod
  fun showAlarmHeadsUpBanner(notificationId: String, timeText: String, payloadJson: String) {
    AgendaAlarmHeadsUp.show(reactApplicationContext.applicationContext, notificationId, timeText, payloadJson)
  }

  @ReactMethod
  fun dismissAlarmHeadsUpBanner(notificationId: String) {
    AgendaAlarmHeadsUp.dismiss(reactApplicationContext.applicationContext, notificationId)
  }

  @ReactMethod
  fun startAlarmSound() {
    AgendaAlarmSound.start(reactApplicationContext.applicationContext)
  }

  @ReactMethod
  fun stopAlarmSound() {
    AgendaAlarmSound.stop(reactApplicationContext.applicationContext)
  }

  /**
   * Drena las acciones (Completar/Posponer) que la Lock Screen no pudo entregar a JS en vivo, para
   * procesarlas sin abrir la app. Devuelve un JSON array y limpia la cola.
   */
  @ReactMethod
  fun consumePendingAlarmActions(promise: com.facebook.react.bridge.Promise) {
    try {
      val prefs = reactApplicationContext
        .getSharedPreferences("AgendaAlarmPrefs", Context.MODE_PRIVATE)
      val raw = prefs.getString("pending_actions", "[]") ?: "[]"
      prefs.edit().remove("pending_actions").apply()
      promise.resolve(raw)
    } catch (e: Exception) {
      promise.resolve("[]")
    }
  }
}
