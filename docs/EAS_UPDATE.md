# EAS Update (OTA de JavaScript)

La app está configurada para **EAS Update** con:

- **`expo-updates`** en dependencias.
- **`expo.updates.url`**: servidor de updates de tu proyecto EAS.
- **`runtimeVersion`**: política **`appVersion`** (el valor de `expo.version` en `app.json`).  
  - Los updates OTA **solo** los reciben builds cuyo `runtimeVersion` coincida con el del update publicado.  
  - Si cambias dependencias nativas / plugins y subes un **nuevo AAB**, sube también **`version`** en `app.json` (p. ej. `1.0.0` → `1.0.1`) para no mezclar binarios viejos con bundles nuevos.

## Canales (`eas.json`)

| Perfil EAS    | Canal          |
|---------------|----------------|
| `production`  | `production`   |
| `preview`     | `preview`      |
| `development` | `development`  |

La build de Play Store debe generarse con **`eas build --profile production`** (o el flujo que use ese perfil) para quedar en el canal **`production`**.

## Publicar un update (solo JS / assets)

Tras instalar en usuarios un **AAB que ya incluya** `expo-updates` y esta configuración:

```bash
npm run update:production -- --message "Descripción del cambio"
```

O:

```bash
eas update --channel production --message "Descripción del cambio"
```

Para preview interno:

```bash
npm run update:preview -- --message "QA build"
```

## Qué **no** va por OTA

Cambios en **código nativo** (Kotlin/Java, `app.json` → plugins que alteran Android/iOS, nueva librería nativa, subida de SDK Expo) requieren **nuevo AAB/APK en Play** (y normalmente **nuevo `version`** en `app.json`).

## Comprobar que el binario pide updates

Tras `eas build` + instalar, en la primera apertura la app puede descargar updates en segundo plano; a veces hace falta **cerrar y volver a abrir** la app para aplicar el bundle nuevo.

Documentación oficial: [EAS Update — Get started](https://docs.expo.dev/eas-update/getting-started/).
