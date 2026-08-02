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

  fun sync(context: Context) {
    val app = context.applicationContext
    val cal = Calendar.getInstance()
    val day = cal.get(Calendar.DAY_OF_MONTH)
    val week = cal.get(Calendar.DAY_OF_WEEK) - 1 // 0=Sun .. 6=Sat
    val aliasSimple = "${ALIAS_PREFIX}${day}_w${week}"
    val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val previous = prefs.getString(KEY_CURRENT, null)
    if (previous == aliasSimple) {
      scheduleMidnight(app)
      return
    }

    val pm = app.packageManager
    val pkg = app.packageName

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
