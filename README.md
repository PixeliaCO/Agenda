# Agenda

Aplicación de agenda diaria con Expo (React Native), TypeScript y soporte para Tailwind/NativeWind.

## Inicio rápido

```bash
npm install
npm run start
```

Escanea el código QR con Expo Go para abrir la app en el dispositivo.

## Probar alarmas en Android sin gastar builds EAS en la nube

- **`npx expo run:android`**: genera `android/` si hace falta, compila e instala por USB en un solo paso (cuota local, no el límite de builds EAS en la nube).
- **`eas build --local`**: mismo AAB/APK que en la nube pero en tu PC (requiere entorno Android configurado).

La app usa **parches nativos** (`patch-package`) y **plugins**; los cambios en JS/TS se pueden iterar con Metro, pero todo lo que toque Kotlin/manifest necesita al menos un `expo run:android` o build local.

## Estructura del proyecto

El código está organizado por capas para mantener una arquitectura clara y escalable:

| Carpeta / archivo | Descripción |
|-------------------|-------------|
| `App.tsx` | Entrada de la app; renderiza la pantalla principal. |
| `src/screens/` | Pantallas (por ejemplo `AgendaScreen`: vista diaria con header, horarios y footer). |
| `src/components/` | Componentes reutilizables: `AgendaHeader`, `AgendaSchedule`, `AgendaFooter`. |
| `src/constants/` | Constantes de la agenda y tema (colores, días, horas). |
| `src/types/` | Tipos TypeScript compartidos. |

La documentación detallada de la arquitectura está en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

Si los usuarios reportan **alarmas retrasadas o silenciosas en Android**, conviene revisar [docs/ALARMAS_ANDROID.md](docs/ALARMAS_ANDROID.md).

## Tecnologías

- **Expo** (SDK 54)
- **React Native**
- **TypeScript**
- **NativeWind / Tailwind** (opcional, para estilos)

## Scripts

- `npm run start` — Inicia el servidor de desarrollo (Expo).
- `npm run android` — Abre la app en Android.
- `npm run ios` — Abre la app en iOS.
- `npm run web` — Abre la app en el navegador.
