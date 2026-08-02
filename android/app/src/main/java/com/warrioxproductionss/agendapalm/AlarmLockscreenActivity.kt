package com.warrioxproductionss.agendapalm

import android.app.Activity
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONObject

class AlarmLockscreenActivity : Activity() {

  companion object {
    const val EXTRA_NOTIFICATION_ID = "agenda_alarm_notification_id"
  }

  // Paleta clara fija: la alarma siempre se ve en tema claro.
  private val cBgTop = 0xFFEAF1FC.toInt()
  private val cBgBottom = 0xFFFFFFFF.toInt()
  private val cBrand = 0xFF1332F6.toInt()
  private val cBrandSoft = 0xFFE7EDFD.toInt()
  private val cOnBrand = 0xFFFFFFFF.toInt()
  private val cTextPrimary = 0xFF152238.toInt()
  private val cTextSecondary = 0xFF5A6B82.toInt()
  private val cKicker = 0xFF1332F6.toInt()
  private val cCardBg = 0xFFFFFFFF.toInt()
  private val cCardBorder = 0xFFE2E9F4.toInt()
  private val cSecBorder = 0xFFC5D4E6.toInt()

  private var cpuWakeLock: PowerManager.WakeLock? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    }
    window.addFlags(
      WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
        WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
    )
    // Barras de sistema en tono claro acorde a la pantalla (iconos oscuros).
    try {
      window.statusBarColor = cBgTop
      window.navigationBarColor = cBgBottom
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        val decor = window.decorView
        var flags = decor.systemUiVisibility
        flags = flags or android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          flags = flags or android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        }
        decor.systemUiVisibility = flags
      }
    } catch (_: Exception) {
    }
    try {
      val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
      cpuWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "com.warrioxproductionss.agendapalm:AgendaAlarmLockUi")
      cpuWakeLock?.setReferenceCounted(false)
      cpuWakeLock?.acquire(120_000L)
    } catch (_: Exception) {
    }

    intent?.getStringExtra(EXTRA_NOTIFICATION_ID)?.takeIf { it.isNotBlank() }?.let { notifId ->
      getSharedPreferences("AgendaAlarmPrefs", Context.MODE_PRIVATE)
        .edit()
        .putString("payload_current_id", notifId)
        .apply()
    }

    // Esta Activity es la UNICA interfaz de alarma: reproduce el sonido y descarta cualquier
    // notificacion para que no haya banner/aviso compitiendo en la cortina.
    startAlarmFeedback()
    try {
      (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancelAll()
    } catch (_: Exception) {
    }

    val payload = loadPayloadJson()
    val eventTitle = payload.optString("displayTitle", payload.optString("titleSnapshot", "Evento"))
    val title = eventTitle
    val body = payload.optString("displayBody", eventTitle)
    val reminderId = payload.optString("reminderId", "")
    val alarmKind = payload.optString("alarmKind", "start")
    val notificationId = payload.optString("notificationId", "")
    val titleSnapshot = payload.optString("titleSnapshot", "Evento")
    val startTimeSnapshot = payload.optString("startTimeSnapshot", "09:00")
    val dateSnapshot = payload.optString("dateSnapshot", "2000-01-01")
    val fireTimeSnapshot = payload.optString("fireTimeSnapshot", startTimeSnapshot)
    Log.d("AgendaAlarm", "LockscreenActivity onCreate reminderId=" + reminderId + " alarmKind=" + alarmKind + " notifId=" + notificationId)
    // #region agent log
    try {
      Thread {
        try {
          val url = java.net.URL("http://127.0.0.1:7821/ingest/cf7ef631-2bd2-4213-9fe4-80b638efc445")
          val conn = url.openConnection() as java.net.HttpURLConnection
          conn.requestMethod = "POST"
          conn.setRequestProperty("Content-Type", "application/json")
          conn.setRequestProperty("X-Debug-Session-Id", "9ba604")
          conn.doOutput = true
          val body = """{"sessionId":"9ba604","runId":"pre-fix","hypothesisId":"H2","location":"AlarmLockscreenActivity.kt:onCreate","message":"lock screen only UI","data":{"reminderId":"$reminderId","notifId":"$notificationId","alarmKind":"$alarmKind"},"timestamp":${System.currentTimeMillis()}}"""
          conn.outputStream.use { it.write(body.toByteArray()) }
          conn.responseCode
          conn.disconnect()
        } catch (_: Exception) {}
      }.start()
    } catch (_: Exception) {}
    // #endregion
    val snoozeLabel = "Intermitente"
    val timeChip = formatTimeChip(fireTimeSnapshot)
    val dateChip = formatDateChip(dateSnapshot)

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      background = GradientDrawable(
        GradientDrawable.Orientation.TOP_BOTTOM,
        intArrayOf(cBgTop, cBgBottom),
      )
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.MATCH_PARENT,
      )
    }

    val scroll = ScrollView(this).apply { isFillViewport = true }
    val content = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(dp(24), dp(40), dp(24), dp(16))
    }

    // Insignia circular con icono de alarma sobre fondo suave de marca.
    val badge = TextView(this).apply {
      text = "⏰"
      textSize = 30f
      gravity = Gravity.CENTER
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(cBrandSoft)
      }
    }
    content.addView(
      badge,
      LinearLayout.LayoutParams(dp(72), dp(72)).apply { bottomMargin = dp(16) },
    )

    content.addView(
      TextView(this).apply {
        text = eventTitle
        textSize = 13f
        setTextColor(cKicker)
        letterSpacing = 0.08f
        typeface = Typeface.DEFAULT_BOLD
        gravity = Gravity.CENTER
      },
      wrap(),
    )

    content.addView(
      TextView(this).apply {
        text = timeChip
        textSize = 54f
        setTextColor(cTextPrimary)
        typeface = Typeface.DEFAULT_BOLD
        gravity = Gravity.CENTER
        setPadding(0, dp(4), 0, dp(12))
      },
      wrap(),
    )

    // Fecha en píldora clara.
    content.addView(
      TextView(this).apply {
        text = dateChip
        textSize = 14f
        setTextColor(cBrand)
        typeface = Typeface.DEFAULT_BOLD
        gravity = Gravity.CENTER
        setPadding(dp(16), dp(8), dp(16), dp(8))
        background = GradientDrawable().apply {
          setColor(cBrandSoft)
          cornerRadius = dp(20).toFloat()
        }
      },
      LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT,
        LinearLayout.LayoutParams.WRAP_CONTENT,
      ).apply { bottomMargin = dp(26) },
    )

    val card = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(22), dp(22), dp(22), dp(22))
      elevation = dp(6).toFloat()
      background = GradientDrawable().apply {
        setColor(cCardBg)
        cornerRadius = dp(24).toFloat()
        setStroke(dp(1), cCardBorder)
      }
    }
    card.addView(
      TextView(this).apply {
        text = title
        textSize = 22f
        setTextColor(cTextPrimary)
        typeface = Typeface.DEFAULT_BOLD
        gravity = Gravity.CENTER
      },
      wrap(),
    )
    card.addView(
      TextView(this).apply {
        text = body
        textSize = 15f
        setTextColor(cTextSecondary)
        gravity = Gravity.CENTER
        setPadding(0, dp(8), 0, 0)
        setLineSpacing(dp(2).toFloat(), 1f)
      },
      wrap(),
    )
    content.addView(
      card,
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT),
    )

    scroll.addView(
      content,
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT),
    )
    root.addView(scroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))

    val footer = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(20), dp(8), dp(20), dp(24))
    }

    val doneBtn = primaryButton("Borrar")
    doneBtn.setOnClickListener {
      deliverBridge("OK", reminderId, alarmKind, notificationId, titleSnapshot, startTimeSnapshot, dateSnapshot)
    }
    footer.addView(
      doneBtn,
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(56)),
    )

    val actionRow = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      setPadding(0, dp(14), 0, 0)
    }
    val snoozeBtn = secondaryButton(snoozeLabel)
    snoozeBtn.setOnClickListener {
      deliverBridge("POSPONER", reminderId, alarmKind, notificationId, titleSnapshot, startTimeSnapshot, dateSnapshot)
    }
    actionRow.addView(
      snoozeBtn,
      LinearLayout.LayoutParams(0, dp(50), 1f).apply { marginEnd = dp(8) },
    )
    val reproBtn = secondaryButton("Ir a")
    reproBtn.setOnClickListener {
      deliverBridge("REPROGRAMAR", reminderId, alarmKind, notificationId, titleSnapshot, startTimeSnapshot, dateSnapshot)
    }
    actionRow.addView(
      reproBtn,
      LinearLayout.LayoutParams(0, dp(50), 1f).apply { marginStart = dp(8) },
    )
    footer.addView(actionRow, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

    root.addView(footer, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

    setContentView(root)
    ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
      val nav = insets.getInsets(WindowInsetsCompat.Type.navigationBars())
      footer.setPadding(dp(20), dp(8), dp(20), dp(24) + nav.bottom)
      insets
    }
  }

  override fun onDestroy() {
    stopAlarmFeedback()
    try {
      cpuWakeLock?.let { wl ->
        if (wl.isHeld) wl.release()
      }
    } catch (_: Exception) {
    }
    cpuWakeLock = null
    super.onDestroy()
  }

  private fun startAlarmFeedback() {
    AgendaAlarmSound.start(this)
  }

  private fun stopAlarmFeedback() {
    AgendaAlarmSound.stop(this)
  }

  private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

  private fun wrap(): LinearLayout.LayoutParams =
    LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)

  private fun primaryButton(label: String): Button {
    return Button(this).apply {
      text = label
      setTextColor(cOnBrand)
      textSize = 16f
      isAllCaps = false
      typeface = Typeface.DEFAULT_BOLD
      stateListAnimator = null
      elevation = dp(2).toFloat()
      background = GradientDrawable().apply {
        setColor(cBrand)
        cornerRadius = dp(26).toFloat()
      }
      setPadding(dp(16), dp(16), dp(16), dp(16))
    }
  }

  private fun secondaryButton(label: String): Button {
    return Button(this).apply {
      text = label
      setTextColor(cBrand)
      textSize = 14f
      isAllCaps = false
      typeface = Typeface.DEFAULT_BOLD
      stateListAnimator = null
      elevation = 0f
      background = GradientDrawable().apply {
        setColor(cCardBg)
        setStroke(dp(1), cSecBorder)
        cornerRadius = dp(22).toFloat()
      }
      setPadding(dp(10), dp(13), dp(10), dp(13))
    }
  }

  private fun formatTimeChip(hhmm: String): String {
    return try {
      val p = hhmm.split(":")
      if (p.size < 2) return hhmm
      var h = p[0].toInt()
      val m = p[1].toInt()
      val pm = h >= 12
      if (h == 0) h = 12 else if (h > 12) h -= 12
      String.format("%d:%02d %s", h, m, if (pm) "p. m." else "a. m.")
    } catch (_: Exception) {
      hhmm
    }
  }

  private fun formatDateChip(iso: String): String {
    return try {
      val p = iso.split("-")
      if (p.size != 3) return iso
      val weekdays = arrayOf(
        "domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado",
      )
      val months = arrayOf(
        "", "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
      )
      val cal = java.util.Calendar.getInstance()
      cal.set(p[0].toInt(), p[1].toInt() - 1, p[2].toInt(), 12, 0, 0)
      val weekday = weekdays[cal.get(java.util.Calendar.DAY_OF_WEEK) - 1]
      val month = months[p[1].toInt()]
      weekday + " " + p[2].toInt().toString() + " " + month + " " + p[0]
    } catch (_: Exception) {
      iso
    }
  }

  private fun loadPayloadJson(): JSONObject {
    val prefs = getSharedPreferences("AgendaAlarmPrefs", Context.MODE_PRIVATE)
    val currentId = prefs.getString("payload_current_id", null) ?: return JSONObject()
    val key = "payload_" + currentId
    val raw = prefs.getString(key, null) ?: return JSONObject()
    return try {
      JSONObject(raw)
    } catch (_: Exception) {
      JSONObject()
    }
  }

  private fun emitToContext(
    ctx: com.facebook.react.bridge.ReactContext,
    action: String,
    reminderId: String,
    alarmKind: String,
    notificationId: String,
    titleSnapshot: String,
    startTimeSnapshot: String,
    dateSnapshot: String,
  ) {
    val map = com.facebook.react.bridge.Arguments.createMap()
    map.putString("action", action)
    map.putString("reminderId", reminderId)
    map.putString("alarmKind", alarmKind)
    map.putString("notificationId", notificationId)
    map.putString("titleSnapshot", titleSnapshot)
    map.putString("startTimeSnapshot", startTimeSnapshot)
    map.putString("dateSnapshot", dateSnapshot)
    ctx.getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("agenda:alarm-bridge", map)
  }

  /**
   * Ejecuta la accion en JS SIN abrir la app. Si el runtime RN ya vive, emite directo; si no, lo
   * arranca en segundo plano (sin UI) y emite al inicializar. Devuelve false si no fue posible.
   */
  private fun deliverToJsWithoutOpeningApp(
    action: String,
    reminderId: String,
    alarmKind: String,
    notificationId: String,
    titleSnapshot: String,
    startTimeSnapshot: String,
    dateSnapshot: String,
  ): Boolean {
    val app = application as? com.facebook.react.ReactApplication ?: return false
    val mgr = app.reactNativeHost.reactInstanceManager
    val existing = mgr.currentReactContext
    if (existing != null) {
      emitToContext(existing, action, reminderId, alarmKind, notificationId, titleSnapshot, startTimeSnapshot, dateSnapshot)
      return true
    }
    return try {
      mgr.addReactInstanceEventListener(object : com.facebook.react.ReactInstanceManager.ReactInstanceEventListener {
        override fun onReactContextInitialized(context: com.facebook.react.bridge.ReactContext) {
          emitToContext(context, action, reminderId, alarmKind, notificationId, titleSnapshot, startTimeSnapshot, dateSnapshot)
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

  private fun launchAppWithAction(
    action: String,
    reminderId: String,
    alarmKind: String,
    notificationId: String,
    titleSnapshot: String,
    startTimeSnapshot: String,
    dateSnapshot: String,
  ) {
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    if (launch == null) {
      Log.w("AgendaAlarm", "launchAppWithAction: getLaunchIntentForPackage=null, no se pudo abrir la app")
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
    Log.d("AgendaAlarm", "launchAppWithAction extras action=" + action + " reminderId=" + reminderId + " alarmKind=" + alarmKind)
    startActivity(launch)
  }

  private fun deliverBridge(
    action: String,
    reminderId: String,
    alarmKind: String,
    notificationId: String,
    titleSnapshot: String,
    startTimeSnapshot: String,
    dateSnapshot: String,
  ) {
    // Cortar sonido/vibracion al instante y limpiar cualquier notificacion.
    stopAlarmFeedback()
    try {
      (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancelAll()
    } catch (_: Exception) {
    }

    // Reprogramar: unica accion que abre la app (para elegir nueva hora). Se encola tambien como
    // pending_action (igual que Completar/Posponer) por si el emit en vivo se pierde por una carrera
    // de arranque en frio (JS aun no registro el listener cuando dispatchFromIntent emite); JS la
    // drena en drainPendingAlarmActions() al iniciar / volver a foreground.
    if (action == "REPROGRAMAR") {
      Log.d("AgendaAlarm", "deliverBridge REPROGRAMAR reminderId=" + reminderId + " alarmKind=" + alarmKind + " notifId=" + notificationId)
      enqueuePendingAction(action, reminderId, alarmKind, notificationId, titleSnapshot, startTimeSnapshot, dateSnapshot)
      launchAppWithAction(action, reminderId, alarmKind, notificationId, titleSnapshot, startTimeSnapshot, dateSnapshot)
      finish()
      return
    }

    // Completar / Posponer: ejecutar en JS sin abrir la app.
    if (deliverToJsWithoutOpeningApp(action, reminderId, alarmKind, notificationId, titleSnapshot, startTimeSnapshot, dateSnapshot)) {
      finish()
      return
    }
    // Ultimo recurso (runtime RN no disponible): encolar la accion para procesarla al iniciar JS,
    // SIN abrir la app. La unica UI de alarma debe ser esta Lock Screen.
    enqueuePendingAction(action, reminderId, alarmKind, notificationId, titleSnapshot, startTimeSnapshot, dateSnapshot)
    finish()
  }

  /** Persiste una accion pendiente (Completar/Posponer) que JS drenara al iniciar (sin abrir la app). */
  private fun enqueuePendingAction(
    action: String,
    reminderId: String,
    alarmKind: String,
    notificationId: String,
    titleSnapshot: String,
    startTimeSnapshot: String,
    dateSnapshot: String,
  ) {
    try {
      val prefs = getSharedPreferences("AgendaAlarmPrefs", Context.MODE_PRIVATE)
      val arr = try {
        org.json.JSONArray(prefs.getString("pending_actions", "[]") ?: "[]")
      } catch (_: Exception) {
        org.json.JSONArray()
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
