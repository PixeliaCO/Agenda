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
import org.json.JSONObject

class AlarmLockscreenActivity : Activity() {

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

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(0xFF111111.toInt())
      setPadding(dp(24), dp(48), dp(24), dp(24))
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

    root.addView(
      TextView(this).apply {
        text = title
        textSize = 22f
        setTextColor(0xFFFFFFFF.toInt())
        gravity = Gravity.CENTER_HORIZONTAL
      },
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT),
    )
    root.addView(
      TextView(this).apply {
        text = body
        textSize = 16f
        setTextColor(0xFFCCCCCC.toInt())
        gravity = Gravity.CENTER_HORIZONTAL
      },
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT),
    )
    root.addView(
      TextView(this).apply {
        text = "Desliza hacia arriba para detener"
        textSize = 14f
        setTextColor(0xFF888888.toInt())
        gravity = Gravity.CENTER_HORIZONTAL
        setPadding(0, dp(24), 0, dp(8))
      },
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT),
    )

    val lpBtn = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
    lpBtn.topMargin = dp(32)
    root.addView(
      Button(this).apply {
        text = "Posponer 5 minutos"
        setOnClickListener {
          deliverBridge(
            "POSPONER",
            reminderId,
            alarmKind,
            notificationId,
            titleSnapshot,
            startTimeSnapshot,
            dateSnapshot,
          )
        }
      },
      lpBtn,
    )
    root.addView(
      TextView(this).apply {
        text = "Eliminar evento"
        textSize = 14f
        setTextColor(0xFFFF6666.toInt())
        gravity = Gravity.CENTER_HORIZONTAL
        setPadding(0, dp(16), 0, 0)
        setOnClickListener {
          deliverBridge(
            "ELIMINAR",
            reminderId,
            alarmKind,
            notificationId,
            titleSnapshot,
            startTimeSnapshot,
            dateSnapshot,
          )
        }
      },
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT),
    )

    setContentView(root)
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

  private fun deliverBridge(
    action: String,
    reminderId: String,
    alarmKind: String,
    notificationId: String,
    titleSnapshot: String,
    startTimeSnapshot: String,
    dateSnapshot: String,
  ) {
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
