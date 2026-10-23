# KeepToMyShelf

Aplicación de escritorio para organizar tu colección de **videojuegos, películas y series**: portadas, valoraciones, estados de seguimiento, filtros, colecciones y perfiles independientes. Funciona sin conexión y guarda todos los datos en tu equipo.

> **Estado:** en desarrollo inicial (v0.x). Todavía no hay una versión utilizable.

## Requisitos para desarrollar

- Windows 10/11 (Linux funciona para desarrollo y CI)
- [Node.js](https://nodejs.org/) 24 o superior
- Git

No hace falta Python ni herramientas de compilación de C++: las dependencias nativas (`better-sqlite3`, `sharp`) se distribuyen precompiladas.

## Puesta en marcha

```bash
npm install        # instala dependencias y descarga el ejecutable de Electron
npm run dev        # abre la app en modo desarrollo con recarga automática
```

En modo desarrollo, **F12** abre las herramientas de desarrollo del navegador (la app no tiene menú).

## Scripts

| Comando               | Qué hace                                               |
| --------------------- | ------------------------------------------------------ |
| `npm run dev`         | Ejecuta la app en modo desarrollo                      |
| `npm run build`       | Compila main, preload y renderer en `out/`             |
| `npm test`            | Ejecuta las pruebas (Vitest)                           |
| `npm run test:e2e`    | Compila la app y ejecuta las pruebas E2E (Playwright)  |
| `npm run lint`        | Analiza el código con ESLint                           |
| `npm run typecheck`   | Comprueba los tipos de TypeScript                      |
| `npm run format`      | Formatea el código con Prettier                        |
| `npm run package`     | Genera el instalador de Windows en `release/<versión>` |
| `npm run package:dir` | Genera la app empaquetada sin instalador (más rápido)  |

## Estructura

```
src/
├─ core/       reglas de negocio puras (sin Electron ni Node)
├─ shared/     contratos compartidos entre procesos (IPC)
├─ main/       proceso principal: ventana, base de datos, archivos
├─ preload/    puente seguro entre la interfaz y el proceso principal
└─ renderer/   interfaz de usuario (React)
```

Más detalles en [docs/](docs/): decisiones de arquitectura en [docs/adr/](docs/adr/) y flujo de trabajo en [docs/GIT-WORKFLOW.md](docs/GIT-WORKFLOW.md).

## Solución de problemas

- **`npx electron --version` muestra la versión de Node o la app no abre ventana:** la variable de entorno `ELECTRON_RUN_AS_NODE` está activa (algunas herramientas, como extensiones de VS Code, la definen). Elimínala en esa terminal: `Remove-Item Env:ELECTRON_RUN_AS_NODE` (PowerShell).
- **Windows SmartScreen avisa al instalar:** el instalador no está firmado digitalmente. Es esperado en esta fase.

## Licencia

[MIT](LICENSE)
