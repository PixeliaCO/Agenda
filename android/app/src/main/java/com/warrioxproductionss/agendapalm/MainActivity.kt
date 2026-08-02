package com.warrioxproductionss.agendapalm

import android.os.Build
import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);
    super.onCreate(null)

    CalendarIconUpdater.sync(this)

    // AgendaMainActivityWake: al abrir (p. ej. notificación / pantalla completa)
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    }
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
          val body = """{"sessionId":"9ba604","runId":"pre-fix","hypothesisId":"H1","location":"MainActivity.kt:onCreate","message":"MainActivity home wake showWhenLocked","data":{"showWhenLocked":true,"turnScreenOn":true},"timestamp":${System.currentTimeMillis()}}"""
          conn.outputStream.use { it.write(body.toByteArray()) }
          conn.responseCode
          conn.disconnect()
        } catch (_: Exception) {}
      }.start()
    } catch (_: Exception) {}
    // #endregion
    AgendaAlarmMainActivityBridge.dispatchFromIntent(this, intent)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
  override fun onNewIntent(intent: android.content.Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    AgendaAlarmMainActivityBridge.dispatchFromIntent(this, intent)
  }

}
