# Arquitectura del proyecto Agenda

Este documento describe la organización del código y la estructura de carpetas del proyecto.

## Estructura de carpetas

```
Agenda/
├── App.tsx                 # Punto de entrada; renderiza la pantalla principal
├── index.ts                # Registro de la app con Expo
├── src/
│   ├── components/         # Componentes reutilizables de UI
│   │   ├── AgendaHeader/   # Cabecera (fecha + selector de días)
│   │   ├── AgendaSchedule/ # Lista de franjas horarias
│   │   ├── AgendaFooter/  # Barra inferior (vistas + acciones)
│   │   └── index.ts       # Exportación centralizada de componentes
│   ├── screens/           # Pantallas completas de la app
│   │   ├── AgendaScreen.tsx
│   │   └── index.ts
│   ├── constants/         # Constantes y configuración
│   │   ├── agenda.ts      # Días, horas por defecto
│   │   └── theme.ts       # Colores y tema
│   └── types/             # Tipos TypeScript
│       └── agenda.ts      # Tipos de la agenda (pestañas, etc.)
└── docs/
    └── ARQUITECTURA.md    # Este archivo
```

## Responsabilidad de cada capa

### `App.tsx`
- Solo monta la pantalla principal (`AgendaScreen`). No debe contener lógica de negocio ni estilos de pantalla.

### `src/screens/`
- **Pantallas**: composición de componentes y estado propio de la pantalla.
- `AgendaScreen`: orquesta header, schedule y footer; maneja el día seleccionado y la pestaña activa (agenda/calendario).

### `src/components/`
- **Componentes presentacionales**: reciben datos y callbacks por props, sin depender de rutas ni estado global.
- Cada componente vive en su propia carpeta con su archivo de componente y un `index.ts` para exportar.
- **AgendaHeader**: muestra la fecha y el selector L–D; notifica día seleccionado y pulsación de flechas.
- **AgendaSchedule**: muestra las franjas horarias con líneas guía; opcionalmente recibe lista de horas.
- **AgendaFooter**: iconos de vista (agenda/calendario) y botones Detalles, Nueva, Ir a; notifica cambios por callbacks.

### `src/constants/`
- **agenda.ts**: constantes de dominio (letras de días, horas por defecto).
- **theme.ts**: colores y valores visuales compartidos para mantener un diseño consistente.

### `src/types/`
- Tipos TypeScript reutilizables (por ejemplo `AgendaViewTab`) para props y estado.

## Flujo de datos

- El estado (día seleccionado, pestaña activa) vive en `AgendaScreen`.
- Los componentes hijos son controlados: reciben valor y `onChange`/callbacks desde la pantalla.
- Las constantes y el tema se importan donde se necesitan, sin contexto global.

## Convenciones

- **Documentación**: cada módulo y componente tiene comentarios JSDoc en español.
- **Exportaciones**: los componentes se exportan desde `src/components/index.ts` y las pantallas desde `src/screens/index.ts` para importaciones limpias (`from '../components'`).
- **Estilos**: cada componente define sus propios `StyleSheet`; los colores vienen de `src/constants/theme.ts`.

## Cómo añadir una nueva pantalla

1. Crear `src/screens/NombreScreen.tsx` y exportarlo en `src/screens/index.ts`.
2. Si hace falta, añadir componentes en `src/components/NombreComponente/` y exportarlos en `src/components/index.ts`.
3. Para navegación entre pantallas, se puede integrar después un router (por ejemplo `expo-router` o React Navigation) y sustituir el contenido de `App.tsx` por el navegador de rutas.
