package com.warrioxproductionss.agendapalm

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
