/**
 * AlarmLockscreenActivity: pantalla completa en bloqueo + posponer 5 min + deslizar arriba = Ok.
 * AgendaAlarmNative: prime payload en SharedPreferences antes de createTriggerNotification.
 * AgendaAlarmMainActivityBridge: reenvía acciones a JS vía RCTDeviceEventEmitter.
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withAndroidManifest } = require('expo/config-plugins');

function pkgToDir(pkg) {
  return pkg.split('.').join(path.sep);
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

import android.content.Context
import android.content.Intent
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

  /** Fallback cuando el sistema bloquea fullScreenIntent (p. ej. sin permiso FSI en API 34+). */
  @ReactMethod
  fun launchLockScreenActivity() {
    val ctx = reactApplicationContext
    val intent = Intent(ctx, AlarmLockscreenActivity::class.java)
    intent.addFlags(
      Intent.FLAG_ACTIVITY_NEW_TASK or
        Intent.FLAG_ACTIVITY_CLEAR_TOP or
        Intent.FLAG_ACTIVITY_SINGLE_TOP
    )
    ctx.startActivity(intent)
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
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.view.Gravity
import android.view.MotionEvent
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.View
import android.widget.ScrollView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONObject

class AlarmLockscreenActivity : Activity() {

  private val cHeader = 0xFF1332F6.toInt()
  private val cHeaderText = 0xFFFFFFFF.toInt()
  private val cScreen = 0xFFFFFFFF.toInt()
  private val cText = 0xFF152238.toInt()
  private val cTextSec = 0xFF4A5F78.toInt()
  private val cLine = 0xFFC5D4E6.toInt()
  private val cStrongBorder = 0xFF243B53.toInt()
  private val cFooterBg = 0xFFC3C3C3.toInt()
  private val cFooterText = 0xFF1A1A1A.toInt()
  private val cFooterStroke = 0xFF888888.toInt()

  private var touchDownY = 0f
  private val swipeThresholdPx by lazy { 120f * resources.displayMetrics.density }
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
    try {
      val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
      cpuWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "${packageName}:AgendaAlarmLockUi")
      cpuWakeLock?.setReferenceCounted(false)
      cpuWakeLock?.acquire(120_000L)
    } catch (_: Exception) {
    }

    val payload = loadPayloadJson()
    val title = payload.optString("displayTitle", payload.optString("titleSnapshot", "Evento"))
    val body = payload.optString("displayBody", "Alarma")
    val reminderId = payload.optString("reminderId", "")
    val alarmKind = payload.optString("alarmKind", "start")
    val notificationId = payload.optString("notificationId", "")
    val titleSnapshot = payload.optString("titleSnapshot", "Evento")
    val startTimeSnapshot = payload.optString("startTimeSnapshot", "09:00")
    val dateSnapshot = payload.optString("dateSnapshot", "2000-01-01")
    val snoozeMinutes = payload.optInt("snoozeMinutes", 5).coerceIn(1, 120)
    val snoozeLabel = "Recordar en " + snoozeMinutes + " min"
    val timeChip = formatTimeChip(startTimeSnapshot)
    val dateChip = formatDateChip(dateSnapshot)

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(cScreen)
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.MATCH_PARENT,
      )
      setOnTouchListener { _, ev ->
        when (ev.action) {
          MotionEvent.ACTION_DOWN -> touchDownY = ev.y
          MotionEvent.ACTION_UP -> {
            if (touchDownY - ev.y > swipeThresholdPx) {
              deliverBridge(
                "OK",
                reminderId,
                alarmKind,
                notificationId,
                titleSnapshot,
                startTimeSnapshot,
                dateSnapshot,
              )
              return@setOnTouchListener true
            }
          }
        }
        false
      }
    }

    val header = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(cHeader)
      setPadding(dp(16), dp(44), dp(16), dp(14))
    }
    header.addView(
      TextView(this).apply {
        text = "Alarma"
        textSize = 12f
        setTextColor(cHeaderText)
        alpha = 0.88f
        letterSpacing = 0.06f
        typeface = Typeface.DEFAULT_BOLD
        gravity = Gravity.CENTER_HORIZONTAL
      },
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT),
    )
    header.addView(
      TextView(this).apply {
        text = title
        textSize = 19f
        setTextColor(cHeaderText)
        typeface = Typeface.DEFAULT_BOLD
        gravity = Gravity.CENTER_HORIZONTAL
        setPadding(0, dp(4), 0, 0)
      },
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT),
    )
    root.addView(
      header,
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT),
    )

    root.addView(
      View(this).apply { setBackgroundColor(cHeader) },
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(3)),
    )

    val scroll = ScrollView(this).apply {
      isFillViewport = true
      setBackgroundColor(cScreen)
    }
    val scrollInner = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(16), dp(20), dp(16), dp(12))
      gravity = Gravity.CENTER_HORIZONTAL
    }

    val card = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(18), dp(18), dp(18), dp(18))
      background = GradientDrawable().apply {
        setColor(cScreen)
        setStroke(dp(2), cStrongBorder)
        cornerRadius = 0f
      }
    }
    card.addView(
      TextView(this).apply {
        text = body
        textSize = 15f
        setTextColor(cTextSec)
        gravity = Gravity.CENTER_HORIZONTAL
        setLineSpacing(dp(2).toFloat(), 1f)
      },
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT),
    )

    val chipRow = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_HORIZONTAL
      setPadding(0, dp(16), 0, dp(4))
    }
    chipRow.addView(makeChip(timeChip), LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    chipRow.addView(
      View(this).apply { /* spacer */ },
      LinearLayout.LayoutParams(dp(8), 1),
    )
    chipRow.addView(makeChip(dateChip), LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    card.addView(
      chipRow,
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT),
    )

    scrollInner.addView(
      card,
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT),
    )
    scroll.addView(
      scrollInner,
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT),
    )
    root.addView(
      scroll,
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f),
    )

    val footer = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(cFooterBg)
      setPadding(dp(12), dp(12), dp(12), dp(20))
    }
    footer.addView(
      View(this).apply { setBackgroundColor(cFooterStroke) },
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1)),
    )

    val actionRow = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      setPadding(0, dp(10), 0, 0)
    }
    val halfLp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
    val snoozeBtn = palmRetroButton(snoozeLabel, cFooterBg, cFooterText)
    snoozeBtn.setOnClickListener {
      deliverBridge("POSPONER", reminderId, alarmKind, notificationId, titleSnapshot, startTimeSnapshot, dateSnapshot)
    }
    actionRow.addView(snoozeBtn, halfLp.apply { marginEnd = dp(6) })
    val reproBtn = palmRetroButton("Reprogramar", cFooterBg, cFooterText)
    reproBtn.setOnClickListener {
      deliverBridge("REPROGRAMAR", reminderId, alarmKind, notificationId, titleSnapshot, startTimeSnapshot, dateSnapshot)
    }
    actionRow.addView(reproBtn, halfLp.apply { marginStart = dp(6) })
    footer.addView(actionRow, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

    val doneBtn = palmRetroButton("Completado", cHeader, cHeaderText, cHeader)
    doneBtn.setOnClickListener {
      deliverBridge("OK", reminderId, alarmKind, notificationId, titleSnapshot, startTimeSnapshot, dateSnapshot)
    }
    footer.addView(
      doneBtn,
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
        topMargin = dp(10)
      },
    )

    root.addView(
      footer,
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT),
    )

    setContentView(root)
    ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
      val nav = insets.getInsets(WindowInsetsCompat.Type.navigationBars())
      footer.setPadding(dp(12), dp(12), dp(12), dp(20) + nav.bottom)
      insets
    }
  }

  override fun onDestroy() {
    try {
      cpuWakeLock?.let { wl ->
        if (wl.isHeld) wl.release()
      }
    } catch (_: Exception) {
    }
    cpuWakeLock = null
    super.onDestroy()
  }

  private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

  private fun palmRetroButton(
    label: String,
    fillColor: Int,
    textColor: Int,
    strokeColor: Int = cFooterStroke,
  ): Button {
    return Button(this).apply {
      text = label
      setTextColor(textColor)
      textSize = 14f
      isAllCaps = false
      typeface = Typeface.DEFAULT_BOLD
      stateListAnimator = null
      elevation = 0f
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        setColor(fillColor)
        setStroke(dp(1), strokeColor)
        cornerRadius = dp(3).toFloat()
      }
      setPadding(dp(10), dp(11), dp(10), dp(11))
    }
  }

  private fun makeChip(label: String): TextView {
    return TextView(this).apply {
      text = label
      textSize = 13f
      setTextColor(cHeaderText)
      typeface = Typeface.DEFAULT_BOLD
      setPadding(dp(12), dp(6), dp(12), dp(6))
      background = GradientDrawable().apply {
        setColor(cHeader)
        cornerRadius = dp(2).toFloat()
      }
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

  /**
   * Entrega la acción al contexto JS sin abrir la app (si está vivo). Devuelve false si no hay contexto.
   */
  private fun emitBridgeDirect(
    action: String,
    reminderId: String,
    alarmKind: String,
    notificationId: String,
    titleSnapshot: String,
    startTimeSnapshot: String,
    dateSnapshot: String,
  ): Boolean {
    val app = application as? com.facebook.react.ReactApplication ?: return false
    val ctx = app.reactNativeHost.reactInstanceManager.currentReactContext ?: return false
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
    return true
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
    // Detener el sonido insistente al instante (no esperar a que JS cancele la notificación).
    try {
      (getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager).cancelAll()
    } catch (_: Exception) {
    }
    // Completado / Recordar: solo detener la alarma; no tiene sentido abrir la app.
    // Reprogramar sí necesita la UI (modal de detalles).
    if (action != "REPROGRAMAR" &&
      emitBridgeDirect(action, reminderId, alarmKind, notificationId, titleSnapshot, startTimeSnapshot, dateSnapshot)
    ) {
      finish()
      return
    }
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    if (launch != null) {
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
    finish()
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
      fs.writeFileSync(path.join(javaDir, 'AgendaAlarmNativeModule.kt'), makeNativeModule(pkg), 'utf8');
      fs.writeFileSync(path.join(javaDir, 'AgendaAlarmNativePackage.kt'), makeNativePackage(pkg), 'utf8');
      fs.writeFileSync(path.join(javaDir, 'AlarmLockscreenActivity.kt'), makeLockscreenActivity(pkg), 'utf8');

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
