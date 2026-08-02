/**
 * Android: icono de launcher dinámico tipo calendario (día abreviado + número).
 * - Copia 217 adaptive icons (foreground + anydpi-v26) desde assets/calendar-icons
 * - activity-alias por combinación día×weekday
 * - AlarmManager a medianoche + BOOT/DATE_CHANGED + sync en Application/MainActivity
 * - Módulo RN CalendarIconModule para refuerzo desde JS
 */
const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withDangerousMod,
  AndroidConfig,
} = require('expo/config-plugins');

const ALIAS_PREFIX = 'CalendarIcon_d';

function midnightAction(pkg) {
  return `${pkg}.UPDATE_CALENDAR_ICON`;
}

function pkgToDir(pkg) {
  return pkg.split('.').join(path.sep);
}

function ensureIconsGenerated(projectRoot) {
  const iconsDir = path.join(projectRoot, 'assets', 'calendar-icons');
  const sample = path.join(iconsDir, 'ic_cal_d1_w0.png');
  if (fs.existsSync(sample)) return iconsDir;
  const script = path.join(projectRoot, 'scripts', 'generate-calendar-icons.py');
  if (!fs.existsSync(script)) {
    throw new Error(
      'withCalendarDynamicIcon: faltan assets/calendar-icons y scripts/generate-calendar-icons.py'
    );
  }
  const { execFileSync } = require('child_process');
  execFileSync('python3', [script], { cwd: projectRoot, stdio: 'inherit' });
  if (!fs.existsSync(sample)) {
    throw new Error('withCalendarDynamicIcon: el generador no produjo iconos');
  }
  return iconsDir;
}

function adaptiveIconXml(fgName) {
  return `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/iconBackground"/>
    <foreground android:drawable="@mipmap/${fgName}"/>
</adaptive-icon>
`;
}

function adaptiveIconXmlDrawable(fgName) {
  return `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/iconBackground"/>
    <foreground android:drawable="@drawable/${fgName}"/>
</adaptive-icon>
`;
}

/**
 * Copia iconos como capas adaptive (evita el shrink de iconos legacy en el launcher).
 * - mipmap-xxxhdpi/ic_cal_dX_wY_foreground.png  → capa foreground
 * - mipmap-xxxhdpi/ic_cal_dX_wY.png              → fallback pre-API 26
 * - mipmap-anydpi-v26/ic_cal_dX_wY.xml           → adaptive icon
 */
function copyMipmaps(androidRoot, iconsDir) {
  // Foreground in drawable-xxxhdpi: more reliable than mipmap-only for some launchers.
  const drawableXxx = path.join(androidRoot, 'app', 'src', 'main', 'res', 'drawable-xxxhdpi');
  const xxx = path.join(androidRoot, 'app', 'src', 'main', 'res', 'mipmap-xxxhdpi');
  const anydpi = path.join(androidRoot, 'app', 'src', 'main', 'res', 'mipmap-anydpi-v26');
  fs.mkdirSync(drawableXxx, { recursive: true });
  fs.mkdirSync(xxx, { recursive: true });
  fs.mkdirSync(anydpi, { recursive: true });

  // Fondo adaptive: azul de marca (si el foreground falla, no queda círculo blanco).
  const colorsPath = path.join(androidRoot, 'app', 'src', 'main', 'res', 'values', 'colors.xml');
  if (fs.existsSync(colorsPath)) {
    let colors = fs.readFileSync(colorsPath, 'utf8');
    if (!colors.includes('name="iconBackground"')) {
      colors = colors.replace(
        /<\/resources>\s*$/,
        '  <color name="iconBackground">#1332F6</color>\n</resources>\n'
      );
      fs.writeFileSync(colorsPath, colors, 'utf8');
    } else {
      colors = colors.replace(
        /<color name="iconBackground">[^<]*<\/color>/,
        '<color name="iconBackground">#1332F6</color>'
      );
      fs.writeFileSync(colorsPath, colors, 'utf8');
    }
  }

  for (let w = 0; w < 7; w++) {
    for (let d = 1; d <= 31; d++) {
      const base = `ic_cal_d${d}_w${w}`;
      const src = path.join(iconsDir, `${base}.png`);
      if (!fs.existsSync(src)) {
        throw new Error(`withCalendarDynamicIcon: falta ${src}`);
      }
      const fg = `${base}_foreground`;
      fs.copyFileSync(src, path.join(drawableXxx, `${fg}.png`));
      fs.copyFileSync(src, path.join(xxx, `${fg}.png`));
      fs.copyFileSync(src, path.join(xxx, `${base}.png`));
      fs.writeFileSync(path.join(anydpi, `${base}.xml`), adaptiveIconXmlDrawable(fg), 'utf8');
    }
  }
}

function todayAliasEnabledFlags() {
  const now = new Date();
  const day = now.getDate();
  // JS: 0=Sun..6=Sat — same as Calendar.DAY_OF_WEEK - 1
  const week = now.getDay();
  return { day, week };
}

function stripLauncherFromMainActivity(manifest) {
  const activity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
  const filters = activity['intent-filter'];
  if (!filters) return;

  const remaining = [];
  const list = Array.isArray(filters) ? filters : [filters];
  for (const filter of list) {
    const actions = [].concat(filter.action || []);
    const categories = [].concat(filter.category || []);
    const hasMain = actions.some((a) => a.$?.['android:name'] === 'android.intent.action.MAIN');
    const hasLauncher = categories.some(
      (c) => c.$?.['android:name'] === 'android.intent.category.LAUNCHER'
    );
    if (hasMain && hasLauncher) {
      continue;
    }
    remaining.push(filter);
  }
  if (remaining.length === 0) {
    delete activity['intent-filter'];
  } else {
    activity['intent-filter'] = remaining;
  }
}

function buildAliasElements(pkg, defaultDay, defaultWeek) {
  const aliases = [];
  for (let w = 0; w < 7; w++) {
    for (let d = 1; d <= 31; d++) {
      const enabled = d === defaultDay && w === defaultWeek;
      aliases.push({
        $: {
          'android:name': `.${ALIAS_PREFIX}${d}_w${w}`,
          'android:enabled': enabled ? 'true' : 'false',
          'android:exported': 'true',
          'android:icon': `@mipmap/ic_cal_d${d}_w${w}`,
          'android:roundIcon': `@mipmap/ic_cal_d${d}_w${w}`,
          'android:targetActivity': '.MainActivity',
          'android:label': '@string/app_name',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
            category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
          },
        ],
      });
    }
  }
  return aliases;
}

function ensurePermission(manifest, name) {
  if (!manifest.manifest['uses-permission']) {
    manifest.manifest['uses-permission'] = [];
  }
  const perms = manifest.manifest['uses-permission'];
  const exists = perms.some((p) => p.$?.['android:name'] === name);
  if (!exists) {
    perms.push({ $: { 'android:name': name } });
  }
}

function withCalendarManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    const pkg = cfg.android?.package || manifest.manifest.$?.package;
    if (!pkg) {
      throw new Error('withCalendarDynamicIcon: android.package requerido');
    }
    const actionMidnight = midnightAction(pkg);

    stripLauncherFromMainActivity(manifest);

    const { day, week } = todayAliasEnabledFlags();
    const aliases = buildAliasElements(pkg, day, week);

    // Remove previous calendar aliases if re-running
    const existing = app['activity-alias'];
    if (existing) {
      const list = Array.isArray(existing) ? existing : [existing];
      app['activity-alias'] = list.filter(
        (a) => !String(a.$?.['android:name'] || '').includes('CalendarIcon_d')
      );
    }
    if (!app['activity-alias']) app['activity-alias'] = [];
    if (!Array.isArray(app['activity-alias'])) {
      app['activity-alias'] = [app['activity-alias']];
    }
    app['activity-alias'].push(...aliases);

    // Receiver
    if (!app.receiver) app.receiver = [];
    if (!Array.isArray(app.receiver)) app.receiver = [app.receiver];
    app.receiver = app.receiver.filter(
      (r) => !String(r.$?.['android:name'] || '').includes('CalendarIconReceiver')
    );
    app.receiver.push({
      $: {
        'android:name': '.CalendarIconReceiver',
        'android:exported': 'true',
        'android:enabled': 'true',
      },
      'intent-filter': [
        {
          action: [
            { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
            { $: { 'android:name': 'android.intent.action.LOCKED_BOOT_COMPLETED' } },
            { $: { 'android:name': 'android.intent.action.DATE_CHANGED' } },
            { $: { 'android:name': 'android.intent.action.TIMEZONE_CHANGED' } },
            { $: { 'android:name': 'android.intent.action.TIME_SET' } },
            { $: { 'android:name': actionMidnight } },
          ],
        },
      ],
    });

    ensurePermission(manifest, 'android.permission.RECEIVE_BOOT_COMPLETED');
    ensurePermission(manifest, 'android.permission.SCHEDULE_EXACT_ALARM');
    ensurePermission(manifest, 'android.permission.USE_EXACT_ALARM');

    return cfg;
  });
}

function makeUpdaterKotlin(packageName) {
  const actionMidnight = midnightAction(packageName);
  return `package ${packageName}

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import java.util.Calendar

object CalendarIconUpdater {
  private const val PREFS = "calendar_dynamic_icon"
  private const val KEY_CURRENT = "current_alias"
  private const val ACTION_MIDNIGHT = "${actionMidnight}"
  private const val ALIAS_PREFIX = "${ALIAS_PREFIX}"

  fun sync(context: Context) {
    val app = context.applicationContext
    val cal = Calendar.getInstance()
    val day = cal.get(Calendar.DAY_OF_MONTH)
    val week = cal.get(Calendar.DAY_OF_WEEK) - 1 // 0=Sun .. 6=Sat
    val aliasSimple = "\${ALIAS_PREFIX}\${day}_w\${week}"
    val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val previous = prefs.getString(KEY_CURRENT, null)
    if (previous == aliasSimple) {
      scheduleMidnight(app)
      return
    }

    val pm = app.packageManager
    val pkg = app.packageName

    if (previous != null) {
      setEnabled(pm, ComponentName(pkg, "\$pkg.\$previous"), false)
    } else {
      // Disable any other enabled calendar alias (first run / unknown state)
      for (w in 0..6) {
        for (d in 1..31) {
          val name = "\${ALIAS_PREFIX}\${d}_w\${w}"
          if (name == aliasSimple) continue
          setEnabled(pm, ComponentName(pkg, "\$pkg.\$name"), false)
        }
      }
    }

    setEnabled(pm, ComponentName(pkg, "\$pkg.\$aliasSimple"), true)
    prefs.edit().putString(KEY_CURRENT, aliasSimple).apply()
    scheduleMidnight(app)
  }

  private fun setEnabled(pm: PackageManager, component: ComponentName, enabled: Boolean) {
    try {
      pm.setComponentEnabledSetting(
        component,
        if (enabled) PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        else PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
        PackageManager.DONT_KILL_APP
      )
    } catch (_: Exception) {
    }
  }

  fun scheduleMidnight(context: Context) {
    val app = context.applicationContext
    val am = app.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val intent = Intent(ACTION_MIDNIGHT).setClass(app, CalendarIconReceiver::class.java)
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    val pi = PendingIntent.getBroadcast(app, 44025, intent, flags)

    val trigger = Calendar.getInstance().apply {
      add(Calendar.DAY_OF_MONTH, 1)
      set(Calendar.HOUR_OF_DAY, 0)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 5)
      set(Calendar.MILLISECOND, 0)
    }.timeInMillis

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        if (am.canScheduleExactAlarms()) {
          am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pi)
        } else {
          am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pi)
        }
      } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pi)
      } else {
        @Suppress("DEPRECATION")
        am.setExact(AlarmManager.RTC_WAKEUP, trigger, pi)
      }
    } catch (_: Exception) {
      try {
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pi)
      } catch (_: Exception) {
      }
    }
  }
}
`;
}

function makeReceiverKotlin(packageName) {
  return `package ${packageName}

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class CalendarIconReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    CalendarIconUpdater.sync(context)
  }
}
`;
}

function makeModuleKotlin(packageName) {
  return `package ${packageName}

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = CalendarIconModule.NAME)
class CalendarIconModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  @ReactMethod
  fun sync() {
    CalendarIconUpdater.sync(reactApplicationContext)
  }

  companion object {
    const val NAME = "CalendarIcon"
  }
}
`;
}

function makePackageKotlin(packageName) {
  return `package ${packageName}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class CalendarIconPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(CalendarIconModule(reactContext))
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`;
}

function injectMainApplication(main) {
  let body = main;
  if (!body.includes('CalendarIconUpdater.sync')) {
    const hook = 'ApplicationLifecycleDispatcher.onApplicationCreate(this)';
    if (body.includes(hook)) {
      body = body.replace(
        hook,
        `CalendarIconUpdater.sync(this)\n    ${hook}`
      );
    }
  }
  if (!body.includes('CalendarIconPackage()')) {
    // Expo 54 typical: PackageList(this).packages.apply { ... }
    if (body.includes('PackageList(this).packages.apply')) {
      body = body.replace(
        /PackageList\(this\)\.packages\.apply\s*\{/,
        `PackageList(this).packages.apply {\n              add(CalendarIconPackage())`
      );
    } else if (body.includes('packages.apply {')) {
      body = body.replace(
        /packages\.apply\s*\{/,
        `packages.apply {\n              add(CalendarIconPackage())`
      );
    } else if (body.includes('return PackageList(this).packages')) {
      body = body.replace(
        'return PackageList(this).packages',
        'return PackageList(this).packages.apply { add(CalendarIconPackage()) }'
      );
    }
  }
  return body;
}

function injectMainActivity(main) {
  if (main.includes('CalendarIconUpdater.sync')) return main;
  const marker = 'super.onCreate(';
  const i = main.indexOf(marker);
  if (i === -1) return main;
  const close = main.indexOf(')', i);
  if (close === -1) return main;
  const lineEnd = main.indexOf('\n', close);
  if (lineEnd === -1) return main;
  const inject = '\n    CalendarIconUpdater.sync(this)\n';
  return main.slice(0, lineEnd + 1) + inject + main.slice(lineEnd + 1);
}

function withCalendarNativeCode(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const androidRoot = cfg.modRequest.platformProjectRoot;
      const projectRoot = cfg.modRequest.projectRoot;
      const pkg = cfg.android?.package;
      if (!pkg || !androidRoot) return cfg;

      const iconsDir = ensureIconsGenerated(projectRoot);
      copyMipmaps(androidRoot, iconsDir);

      const javaDir = path.join(androidRoot, 'app', 'src', 'main', 'java', pkgToDir(pkg));
      fs.mkdirSync(javaDir, { recursive: true });

      fs.writeFileSync(path.join(javaDir, 'CalendarIconUpdater.kt'), makeUpdaterKotlin(pkg), 'utf8');
      fs.writeFileSync(path.join(javaDir, 'CalendarIconReceiver.kt'), makeReceiverKotlin(pkg), 'utf8');
      fs.writeFileSync(path.join(javaDir, 'CalendarIconModule.kt'), makeModuleKotlin(pkg), 'utf8');
      fs.writeFileSync(path.join(javaDir, 'CalendarIconPackage.kt'), makePackageKotlin(pkg), 'utf8');

      const mainAppPath = path.join(javaDir, 'MainApplication.kt');
      if (fs.existsSync(mainAppPath)) {
        let main = fs.readFileSync(mainAppPath, 'utf8');
        main = injectMainApplication(main);
        fs.writeFileSync(mainAppPath, main, 'utf8');
      }

      const mainActPath = path.join(javaDir, 'MainActivity.kt');
      if (fs.existsSync(mainActPath)) {
        let main = fs.readFileSync(mainActPath, 'utf8');
        main = injectMainActivity(main);
        fs.writeFileSync(mainActPath, main, 'utf8');
      }

      return cfg;
    },
  ]);
}

function withCalendarDynamicIcon(config) {
  let c = withCalendarManifest(config);
  c = withCalendarNativeCode(c);
  return c;
}

module.exports = withCalendarDynamicIcon;
