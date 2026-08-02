/**
 * Android: manifest (showWhenLocked / turnScreenOn) + inyección en MainActivity.onCreate
 * para que al abrir por notificación / full-screen intent la ventana pueda encender pantalla.
 * MainActivity con showWhenLocked/turnScreenOn al abrir por notificación (sin USE_FULL_SCREEN_INTENT en manifest).
 */
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, AndroidConfig, withDangerousMod } = require('expo/config-plugins');

function pkgToDir(pkg) {
  return pkg.split('.').join(path.sep);
}

function withAgendaMainActivityWakeKotlin(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const pkg = cfg.android?.package;
      const root = cfg.modRequest.platformProjectRoot;
      if (!pkg || !root) return cfg;
      const mainActivityPath = path.join(root, 'app', 'src', 'main', 'java', pkgToDir(pkg), 'MainActivity.kt');
      if (!fs.existsSync(mainActivityPath)) return cfg;
      let body = fs.readFileSync(mainActivityPath, 'utf8');
      if (body.includes('AgendaMainActivityWake')) return cfg;
      const marker = 'super.onCreate(';
      const i = body.indexOf(marker);
      if (i === -1) return cfg;
      const close = body.indexOf(')', i);
      if (close === -1) return cfg;
      const lineEnd = body.indexOf('\n', close);
      if (lineEnd === -1) return cfg;
      const inject = [
        '',
        '    // AgendaMainActivityWake: al abrir (p. ej. notificación / pantalla completa)',
        '    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O_MR1) {',
        '      setShowWhenLocked(true)',
        '      setTurnScreenOn(true)',
        '    }',
        '    // #region agent log',
        '    try {',
        '      Thread {',
        '        try {',
        '          val url = java.net.URL("http://127.0.0.1:7821/ingest/cf7ef631-2bd2-4213-9fe4-80b638efc445")',
        '          val conn = url.openConnection() as java.net.HttpURLConnection',
        '          conn.requestMethod = "POST"',
        '          conn.setRequestProperty("Content-Type", "application/json")',
        '          conn.setRequestProperty("X-Debug-Session-Id", "9ba604")',
        '          conn.doOutput = true',
        '          val body = """{"sessionId":"9ba604","runId":"pre-fix","hypothesisId":"H1","location":"MainActivity.kt:onCreate","message":"MainActivity home wake showWhenLocked","data":{"showWhenLocked":true,"turnScreenOn":true},"timestamp":${System.currentTimeMillis()}}"""',
        '          conn.outputStream.use { it.write(body.toByteArray()) }',
        '          conn.responseCode',
        '          conn.disconnect()',
        '        } catch (_: Exception) {}',
        '      }.start()',
        '    } catch (_: Exception) {}',
        '    // #endregion',
        '',
      ].join('\n');
      const newBody = body.slice(0, lineEnd + 1) + inject + body.slice(lineEnd + 1);
      fs.writeFileSync(mainActivityPath, newBody, 'utf8');
      return cfg;
    },
  ]);
}

function withAgendaFullScreenAlarm(config) {
  let c = withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    activity.$['android:showWhenLocked'] = 'true';
    activity.$['android:turnScreenOn'] = 'true';
    return cfg;
  });
  c = withAgendaMainActivityWakeKotlin(c);
  return c;
}

module.exports = withAgendaFullScreenAlarm;
