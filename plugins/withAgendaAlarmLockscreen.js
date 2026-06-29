/**
 * AlarmLockscreenActivity: pantalla completa en bloqueo + posponer 5 min + deslizar arriba = Ok.
 * AgendaAlarmNative: prime payload en SharedPreferences antes de createTriggerNotification.
 * AgendaAlarmMainActivityBridge: reenvía acciones a JS vía RCTDeviceEventEmitter.
 */
const fs = require('fs');
const path = require('path');

function writeAlarmBannerDrawables(drawableDir) {
  fs.mkdirSync(drawableDir, { recursive: true });
  const files = {
    'ic_agenda_alarm.xml': `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp"
    android:viewportWidth="24" android:viewportHeight="24">
  <path android:fillColor="#FFFFFF" android:pathData="M22,5.72l-4.6,-3.86 -1.29,1.53 4.6,3.86L22,5.72zM12,4c-4.97,0 -9,4.03 -9,9s4.03,9 9,9 9,-4.03 9,-9 -4.03,-9 -9,-9zM12,20c-3.87,0 -7,-3.13 -7,-7s3.13,-7 7,-7 7,3.13 7,7 -3.13,7 -7,7zM11.5,7v5.25l4.5,2.67 -0.75,1.23L10,13V7h1.5z"/>
</vector>`,
    'ic_agenda_snooze.xml': `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp"
    android:viewportWidth="24" android:viewportHeight="24">
  <path android:fillColor="#FFFFFF" android:pathData="M12,4V1L8,5l4,4V6c3.31,0 6,2.69 6,6 0,1.01 -0.25,1.97 -0.7,2.8l1.46,1.46C19.54,15.03 20,13.57 20,12c0,-4.42 -3.58,-8 -8,-8zM12,18c-3.31,0 -6,-2.69 -6,-6 0,-1.01 0.25,-1.97 0.7,-2.8L5.24,7.74C4.46,8.97 4,10.43 4,12c0,4.42 3.58,8 8,8v3l4,-4 -4,-4v3z"/>
</vector>`,
    'ic_agenda_stop.xml': `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp"
    android:viewportWidth="24" android:viewportHeight="24">
  <path android:fillColor="#FFFFFF" android:pathData="M6,6h12v12H6z"/>
</vector>`,
  };
  for (const [name, xml] of Object.entries(files)) {
    fs.writeFileSync(path.join(drawableDir, name), xml, 'utf8');
  }
}
const { withDangerousMod, withAndroidManifest } = require('expo/config-plugins');

function pkgToDir(pkg) {
  return pkg.split('.').join(path.sep);
}

function makeAlarmSound(packageName) {
  return `package ${packageName}

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/** Sonido/vibración de alarma compartido: banner, Lock Screen y módulo RN. */
object AgendaAlarmSound {
  private var alarmPlayer: MediaPlayer? = null
  private var vibrator: Vibrator? = null

  @Synchronized
  fun start(ctx: Context) {
    if (alarmPlayer?.isPlaying == true) return
    stop(ctx)
    try {
      val uri = Uri.parse("android.resource://" + ctx.packageName + "/raw/alert")
      alarmPlayer = MediaPlayer().apply {
        setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build(),
        )
        setDataSource(ctx, uri)
        isLooping = true
        prepare()
        start()
      }
    } catch (_: Exception) {
    }
    try {
      val v = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        (ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        ctx.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
      }
      vibrator = v
      val pattern = longArrayOf(0, 600, 700)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        v.vibrate(VibrationEffect.createWaveform(pattern, 0))
      } else {
        @Suppress("DEPRECATION")
        v.vibrate(pattern, 0)
      }
    } catch (_: Exception) {
    }
  }

  @Synchronized
  fun stop(ctx: Context) {
    try {
      alarmPlayer?.stop()
    } catch (_: Exception) {
    }
    try {
      alarmPlayer?.release()
    } catch (_: Exception) {
    }
    alarmPlayer = null
    try {
      vibrator?.cancel()
    } catch (_: Exception) {
    }
    vibrator = null
  }
}
`;
}

function makeMainActivityBridge(packageName) {
  return `package ${packageName}

import android.app.Activity
import android.content.Intent
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
    if (intent == null) return
    val action = intent.getStringExtra(EXTRA_ACTION) ?: return
    val reminderId = intent.getStringExtra(EXTRA_REMINDER_ID) ?: return
    val alarmKind = intent.getStringExtra(EXTRA_ALARM_KIND) ?: return
    val notificationId = intent.getStringExtra(EXTRA_NOTIF_ID) ?: ""
    val titleSnapshot = intent.getStringExtra(EXTRA_TITLE_SNAPSHOT) ?: "Evento"
    val startTimeSnapshot = intent.getStringExtra(EXTRA_START_TIME_SNAPSHOT) ?: "09:00"
    val dateSnapshot = intent.getStringExtra(EXTRA_DATE_SNAPSHOT) ?: "2000-01-01"

    intent.removeExtra(EXTRA_ACTION)

    val app = activity.application as? ReactApplication ?: return
    val mgr = app.reactNativeHost.reactInstanceManager
    val existing = mgr.currentReactContext
    if (existing != null) {
      emit(existing, action, reminderId, alarmKind, notificationId, titleSnapshot, startTimeSnapshot, dateSnapshot)
      return
    }
    val listener = object : com.facebook.react.ReactInstanceManager.ReactInstanceEventListener {
      override fun onReactContextInitialized(context: ReactContext) {
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
    ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("agenda:alarm-bridge", map)
  }
}
`;
}

function makeNativeModule(packageName) {
  return `package ${packageName}

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
`;
}

function makeNativePackage(packageName) {
  return `package ${packageName}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class AgendaAlarmNativePackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): MutableList<NativeModule> {
    return mutableListOf(AgendaAlarmNativeModule(reactContext))
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): MutableList<ViewManager<*, *>> {
    return mutableListOf()
  }
}
`;
}

function makeLockscreenActivity(packageName) {
  return `package ${packageName}

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
      cpuWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "${packageName}:AgendaAlarmLockUi")
      cpuWakeLock?.setReferenceCounted(false)
      cpuWakeLock?.acquire(120_000L)
    } catch (_: Exception) {
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
    val snoozeMinutes = payload.optInt("snoozeMinutes", 5).coerceIn(1, 120)
    val snoozeLabel = "Recordar en " + snoozeMinutes + " min"
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

    val doneBtn = primaryButton("Completar")
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
    val reproBtn = secondaryButton("Reprogramar")
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
    val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return
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

    // Reprogramar: unica accion que abre la app (para elegir nueva hora).
    if (action == "REPROGRAMAR") {
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
    } catch (_: Exception) {
    }
  }
}
`;
}

function injectMainApplication(main, packageName) {
  if (main.includes('AgendaAlarmNativePackage')) return main;
  void packageName;

  if (main.includes('PackageList(this).packages.apply')) {
    main = main.replace(
      /PackageList\(this\)\.packages\.apply\s*\{/,
      'PackageList(this).packages.apply {\n          add(AgendaAlarmNativePackage())\n'
    );
    return main;
  }
  if (main.includes('PackageList(this).packages')) {
    main = main.replace(
      /PackageList\(this\)\.packages(?!\.apply)/,
      'PackageList(this).packages.apply {\n          add(AgendaAlarmNativePackage())\n        }'
    );
    return main;
  }
  console.warn(
    'withAgendaAlarmLockscreen: no se pudo inyectar AgendaAlarmNativePackage (patrón PackageList no encontrado). Añade manualmente add(AgendaAlarmNativePackage()) en MainApplication.'
  );
  return main;
}

function injectMainActivity(main) {
  if (main.includes('AgendaAlarmMainActivityBridge.dispatchFromIntent')) return main;
  const re = /(super\.onCreate\([^)]*\)\s*\n)/;
  if (re.test(main)) {
    main = main.replace(
      re,
      '$1    AgendaAlarmMainActivityBridge.dispatchFromIntent(this, intent)\n'
    );
  }
  if (!main.includes('override fun onNewIntent')) {
    const lastBrace = main.lastIndexOf('\n}');
    if (lastBrace === -1) return main;
    const onNew = `
  override fun onNewIntent(intent: android.content.Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    AgendaAlarmMainActivityBridge.dispatchFromIntent(this, intent)
  }
`;
    main = main.slice(0, lastBrace) + onNew + main.slice(lastBrace);
  }
  return main;
}

function withAlarmLockscreenManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) return cfg;
    if (!app.activity) app.activity = [];
    const has = app.activity.some(
      (a) => a.$['android:name'] === '.AlarmLockscreenActivity' || a.$['android:name']?.endsWith('AlarmLockscreenActivity')
    );
    if (!has) {
      app.activity.push({
        $: {
          'android:name': '.AlarmLockscreenActivity',
          'android:exported': 'false',
          'android:theme': '@android:style/Theme.Material.Light.NoActionBar.Fullscreen',
          'android:showWhenLocked': 'true',
          'android:turnScreenOn': 'true',
          'android:excludeFromRecents': 'true',
          'android:launchMode': 'singleInstance',
          'android:taskAffinity': '',
        },
      });
    }
    const bannerAction = pkg + '.ALARM_BANNER_ACTION';
    const hasReceiver = (app.receiver || []).some(
      (r) => r.$['android:name'] === '.AgendaAlarmBannerReceiver'
    );
    if (!hasReceiver) {
      if (!app.receiver) app.receiver = [];
      app.receiver.push({
        $: { 'android:name': '.AgendaAlarmBannerReceiver', 'android:exported': 'false' },
        'intent-filter': [{ action: [{ $: { 'android:name': bannerAction } }] }],
      });
    }
    return cfg;
  });
}

function withAgendaAlarmLockscreen(config) {
  const pkg = config.android?.package;
  if (!pkg) {
    console.warn('withAgendaAlarmLockscreen: falta android.package en app config');
    return config;
  }

  let c = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const root = cfg.modRequest.platformProjectRoot;
      if (!root) return cfg;
      const javaDir = path.join(root, 'app', 'src', 'main', 'java', pkgToDir(pkg));
      fs.mkdirSync(javaDir, { recursive: true });

      fs.writeFileSync(path.join(javaDir, 'AgendaAlarmMainActivityBridge.kt'), makeMainActivityBridge(pkg), 'utf8');
      fs.writeFileSync(path.join(javaDir, 'AgendaAlarmSound.kt'), makeAlarmSound(pkg), 'utf8');
      fs.writeFileSync(path.join(javaDir, 'AgendaAlarmNativeModule.kt'), makeNativeModule(pkg), 'utf8');
      fs.writeFileSync(path.join(javaDir, 'AgendaAlarmNativePackage.kt'), makeNativePackage(pkg), 'utf8');
      fs.writeFileSync(path.join(javaDir, 'AlarmLockscreenActivity.kt'), makeLockscreenActivity(pkg), 'utf8');

      const drawableDir = path.join(root, 'app', 'src', 'main', 'res', 'drawable');
      writeAlarmBannerDrawables(drawableDir);

      const mainAppPath = path.join(javaDir, 'MainApplication.kt');
      if (fs.existsSync(mainAppPath)) {
        let main = fs.readFileSync(mainAppPath, 'utf8');
        main = injectMainApplication(main, pkg);
        fs.writeFileSync(mainAppPath, main, 'utf8');
      } else {
        console.warn('withAgendaAlarmLockscreen: MainApplication.kt no encontrado');
      }

      const mainActPath = path.join(javaDir, 'MainActivity.kt');
      if (fs.existsSync(mainActPath)) {
        let main = fs.readFileSync(mainActPath, 'utf8');
        main = injectMainActivity(main);
        fs.writeFileSync(mainActPath, main, 'utf8');
      } else {
        console.warn('withAgendaAlarmLockscreen: MainActivity.kt no encontrado');
      }

      return cfg;
    },
  ]);

  c = withAlarmLockscreenManifest(c);
  return c;
}

module.exports = withAgendaAlarmLockscreen;
