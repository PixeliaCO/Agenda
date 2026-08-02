package com.warrioxproductionss.agendapalm

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
