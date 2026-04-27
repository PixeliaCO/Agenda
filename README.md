# Agenda

Aplicación de agenda diaria con Expo (React Native), TypeScript y soporte para Tailwind/NativeWind.

## Inicio rápido

```bash
npm install
npm run start
```

Escanea el código QR con Expo Go para abrir la app en el dispositivo.

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
