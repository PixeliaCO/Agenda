package com.warrioxproductionss.agendapalm

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
  private const val ACTION_MIDNIGHT = "com.warrioxproductionss.agendapalm.UPDATE_CALENDAR_ICON"
  private const val ALIAS_PREFIX = "CalendarIcon_d"
  // The single alias shipped with android:enabled="true". The OS enables it at install
  // time no matter what SharedPreferences hold, so sync() has to clear it explicitly or
  // the launcher ends up showing two icons for the app.
  private const val BAKED_DEFAULT_ALIAS = "CalendarIcon_d1_w0"

  fun sync(context: Context) {
    val app = context.applicationContext
    val cal = Calendar.getInstance()
    val day = cal.get(Calendar.DAY_OF_MONTH)
    val week = cal.get(Calendar.DAY_OF_WEEK) - 1 // 0=Sun .. 6=Sat
    val aliasSimple = "${ALIAS_PREFIX}${day}_w${week}"
    val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val previous = prefs.getString(KEY_CURRENT, null)

    val pm = app.packageManager
    val pkg = app.packageName

    // Self-heal the install-time alias. On a fresh install the OS enables
    // BAKED_DEFAULT_ALIAS from the manifest, yet prefs may already name a different
    // alias (app update, or auto-backup restore while allowBackup="true"). In that case
    // nothing below would ever disable it, leaving two launcher icons.
    if (BAKED_DEFAULT_ALIAS != aliasSimple) {
      val baked = ComponentName(pkg, "$pkg.$BAKED_DEFAULT_ALIAS")
      if (isEnabled(pm, baked, true)) setEnabled(pm, baked, false)
    }

    if (previous == aliasSimple) {
      // Prefs are a cache, not the truth: confirm today's alias is actually on.
      val target = ComponentName(pkg, "$pkg.$aliasSimple")
      if (!isEnabled(pm, target, aliasSimple == BAKED_DEFAULT_ALIAS)) {
        setEnabled(pm, target, true)
      }
      scheduleMidnight(app)
      return
    }

    if (previous != null) {
      setEnabled(pm, ComponentName(pkg, "$pkg.$previous"), false)
    } else {
      // Disable any other enabled calendar alias (first run / unknown state)
      for (w in 0..6) {
        for (d in 1..31) {
          val name = "${ALIAS_PREFIX}${d}_w${w}"
          if (name == aliasSimple) continue
          setEnabled(pm, ComponentName(pkg, "$pkg.$name"), false)
        }
      }
    }

    setEnabled(pm, ComponentName(pkg, "$pkg.$aliasSimple"), true)
    prefs.edit().putString(KEY_CURRENT, aliasSimple).apply()
    scheduleMidnight(app)
  }

  // whenUnset = the manifest's android:enabled for this component, used when no explicit
  // override has been applied yet.
  private fun isEnabled(pm: PackageManager, component: ComponentName, whenUnset: Boolean): Boolean {
    return try {
      when (pm.getComponentEnabledSetting(component)) {
        PackageManager.COMPONENT_ENABLED_STATE_ENABLED -> true
        PackageManager.COMPONENT_ENABLED_STATE_DISABLED -> false
        else -> whenUnset
      }
    } catch (_: Exception) {
      whenUnset
    }
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
