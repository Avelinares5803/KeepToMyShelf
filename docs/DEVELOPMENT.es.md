# Guía de desarrollo

[English](DEVELOPMENT.md) | **Español**

Cómo preparar el proyecto, ejecutarlo, seguir sus convenciones y generar el instalador. El diseño general está en [ARCHITECTURE.es.md](ARCHITECTURE.es.md), y las pruebas en [TESTING.es.md](TESTING.es.md).

## Requisitos

- **Windows 10 u 11.** Linux sirve para desarrollar y para la CI, pero el instalador y las pruebas E2E se ejecutan en Windows.
- **[Node.js](https://nodejs.org/) 24** o superior (con npm 11).
- **Git.**

No hace falta Python ni herramientas de compilación de C++: las dependencias nativas (`better-sqlite3` y `sharp`) se distribuyen precompiladas con N-API, una interfaz binaria estable que funciona tanto en Node.js (pruebas) como en Electron (app). Por eso nunca se recompilan (`npmRebuild: false`).

## Puesta en marcha

```powershell
git clone https://github.com/Avelinares5803/KeepToMyShelf.git
cd KeepToMyShelf
npm ci           # instala las dependencias exactas y descarga el ejecutable de Electron
npm run dev      # abre la app en modo desarrollo, con recarga al cambiar el código
```

- En modo desarrollo, **F12** abre las herramientas de desarrollo del navegador (la app no tiene menú).
- `npm run dev` usa tu carpeta de datos real (`%APPDATA%\KeepToMyShelf`). Para probar algo sin tocarla, apunta antes la app a otra carpeta: `$env:KTMS_USER_DATA_DIR = "$env:TEMP\ktms-dev"`.

## Scripts

| Comando               | Qué hace                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `npm run dev`         | Ejecuta la app en modo desarrollo                                                                 |
| `npm run build`       | Compila main, preload y renderer en `out/`                                                        |
| `npm test`            | Ejecuta las pruebas unitarias y de integración (Vitest)                                           |
| `npm run test:watch`  | Lo mismo, repitiéndolas al cambiar el código                                                      |
| `npm run test:e2e`    | Compila la app y ejecuta las pruebas E2E (Playwright)                                             |
| `npm run test:smoke`  | Instala, prueba y desinstala lo que generó `npm run package` (ver [TESTING.es.md](TESTING.es.md)) |
| `npm run lint`        | Analiza el código con ESLint                                                                      |
| `npm run typecheck`   | Comprueba los tipos de TypeScript                                                                 |
| `npm run format`      | Formatea el código con Prettier (`format:check` solo lo comprueba)                                |
| `npm run package`     | Genera el instalador y el zip portable en `release/<versión>/`                                    |
| `npm run package:dir` | Genera solo la app sin instalador en `release/<versión>/win-unpacked` (más rápido)                |

## Antes de cada push

Las mismas comprobaciones que la CI:

```powershell
npm run lint; npm run typecheck; npx prettier --check .; npx vitest run; npm run build
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue; npx playwright test
```

## Particularidades de Windows

- **`ELECTRON_RUN_AS_NODE`:** el terminal de VS Code la define, y entonces Electron arranca como Node.js y no abre ninguna ventana. Elimínala en ese terminal antes de `npm run dev` o de Playwright: `Remove-Item Env:ELECTRON_RUN_AS_NODE`.
- **PowerShell 5.1** no admite `&&` (usa `;`), y corta los argumentos con comillas dobles al pasarlos a programas nativos. Para mensajes de commit con comillas, escríbelos en un archivo y usa `git commit -F <archivo>`.
- **Codificación:** `Get-Content`/`Set-Content` usan la página de códigos ANSI y estropean las tildes. Edita los archivos con tu editor.
- **Las rutas con caracteres no ASCII** (`C:\Users\Adrián\…`) funcionan, y las pruebas crean sus carpetas temporales con esos caracteres a propósito.

## Convenciones del código

- **TypeScript estricto** en todo el proyecto, formateado con Prettier y revisado con ESLint. TypeScript 6, no 7, hasta que typescript-eslint lo admita.
- **Respeta las capas** descritas en [ARCHITECTURE.es.md](ARCHITECTURE.es.md#capas): `core` no usa Electron ni Node.js; el preload solo importa tipos; la interfaz nunca importa de `main`.
- **Cada llamada IPC devuelve un `IpcResult`.** Los errores esperados son un `AppError` con un código `dominio.código`, traducido en los dos idiomas.
- **Nada de fallos silenciosos:** ni `catch` genéricos que oculten un error ni valores por defecto injustificados.
- **Todo texto visible en los dos idiomas.** Los campos vacíos no se muestran en la ficha. Toda acción destructiva pide confirmación, con el foco en «Cancelar».
- **Dependencias:** añade una solo si está justificada, con una versión exacta de al menos 7 días de antigüedad. Dependabot propone las actualizaciones cada semana.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/es/), una rama y una pull request por cambio. Ver [GIT-WORKFLOW.es.md](GIT-WORKFLOW.es.md).

## Tareas habituales

### Añadir una llamada IPC

1. **Esquema:** añade el esquema zod de la entrada a `ipcInputSchemas`, en [`src/shared/ipc-schemas.ts`](../src/shared/ipc-schemas.ts) (`z.undefined()` si no recibe nada).
2. **Canal:** añádelo a `IpcChannels`, en [`src/shared/ipc.ts`](../src/shared/ipc.ts) (`'área:acción'`), y da tipo al método en `KeepToMyShelfApi`.
3. **Preload:** asocia el método al canal en [`src/preload/index.ts`](../src/preload/index.ts).
4. **Handler:** añádelo en [`src/main/ipc/register-handlers.ts`](../src/main/ipc/register-handlers.ts) con `createHandler` (o `createAsyncHandler` si devuelve una promesa). Solo valida y llama a un servicio. TypeScript falla si un canal no tiene handler.
5. **Errores:** traduce cada código de error nuevo en `es.json` y `en.json`, dentro de `errors`.
6. **Pruebas:** la prueba de integración del servicio y, si cambia la interfaz, una E2E.

### Añadir un texto traducido

Añade la misma clave a [`src/renderer/i18n/locales/es.json`](../src/renderer/i18n/locales/es.json) y a [`en.json`](../src/renderer/i18n/locales/en.json). Una prueba ([`tests/unit/i18n-locales.test.ts`](../tests/unit/i18n-locales.test.ts)) comprueba que los dos archivos tienen las mismas claves, que ningún texto está vacío y que todos los códigos de error de `core`, `main` y `shared` están traducidos. **Un dominio de error nuevo** (la parte antes del punto) debe añadirse al patrón de esa prueba; si no, sus códigos no se comprueban.

### Cambiar el esquema de la base de datos

1. Crea el siguiente archivo numerado en `src/main/infrastructure/db/migrations/library/` (o `app/`), como `0007_algo.sql`, sin `BEGIN`/`COMMIT`.
2. Impórtalo con `?raw` y añádelo al final de la lista del `index.ts` de esa carpeta.
3. Escribe una prueba que cree una base de datos de la versión anterior con datos, la migre y compruebe el resultado. Ver [`tests/integration/db/library-migration-v6.test.ts`](../tests/integration/db/library-migration-v6.test.ts).

**Nunca modifiques una migración que ya está en `main`.** Si tenía un error, corrígelo con una nueva. Las copias de seguridad guardan la versión del esquema, y una app más antigua se niega a restaurar una copia de un esquema más nuevo.

### Añadir un filtro

Añade un descriptor a `FILTER_FIELDS`, en [`src/core/filters/filter-fields.ts`](../src/core/filters/filter-fields.ts). Si su tipo ya existe (papel de catálogo, lista cerrada, sí/no, valoración), el motor de consultas no cambia. Después, ofrécelo en la interfaz (`fieldsToOffer`, en `advanced-filters.ts`, y `simple-filters.ts` para los filtros simples) y añade su nombre en los dos idiomas. Un tipo de campo nuevo necesita además cambios en el motor, en [`item-query.ts`](../src/main/infrastructure/db/item-query.ts).

### Cambiar las listas iniciales de los catálogos

Las listas de [`default-catalogs.ts`](../src/main/infrastructure/db/default-catalogs.ts) se copian **una vez por perfil**, la primera vez que se abre. Los valores añadidos después solo llegan a los perfiles nuevos. Un catálogo nuevo necesita su propia marca (como `default_countries_seeded`) para que los perfiles existentes lo reciban. Los alias no deben ser redundantes; una prueba lo impone.

### Cambiar el icono de la app

Edita `build/icon.svg` y ejecuta `node scripts/render-icon.mjs`, que escribe `build/icon.png`. electron-builder genera el `.ico` a partir de él.

## Generar el instalador

```powershell
npm run package
```

Compila la app, ejecuta electron-builder (instalador NSIS y `release/<versión>/win-unpacked`) y después `scripts/package-portable.mjs`, que genera el zip portable. El resultado está en `release/<versión>/`:

- `KeepToMyShelf-Setup-<versión>.exe`: el instalador.
- `KeepToMyShelf-Portable-<versión>.zip`: la versión portable, con una carpeta `KeepToMyShelf\` que contiene la app y una carpeta `KeepToMyShelf Data\`, vacía salvo por un archivo «léeme».
- `win-unpacked\`: la app sin instalador, útil para una prueba rápida.

Para comprobar el resultado, `npm run test:smoke` lo instala en una carpeta temporal, lo prueba y lo desinstala (se niega a empezar si KeepToMyShelf ya está instalado en tu usuario). La publicación de una versión se explica en [RELEASING.es.md](RELEASING.es.md).
