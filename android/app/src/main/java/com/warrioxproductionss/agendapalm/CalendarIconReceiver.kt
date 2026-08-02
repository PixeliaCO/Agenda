package com.warrioxproductionss.agendapalm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class CalendarIconReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    CalendarIconUpdater.sync(context)
  }
}
