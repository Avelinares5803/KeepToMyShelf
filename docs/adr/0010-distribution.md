# ADR 0010: Distribución en Windows

- **Estado:** aceptada; implementada en la F12-A (icono, instalador y zip portable).
- **Fecha:** 2026-11-16

## Contexto

La v1.0 se distribuye para Windows 10 y 11, sin firma de código. Hasta la F11, `electron-builder.yml` solo generaba un instalador NSIS y la app no tenía icono propio. El ROADMAP pedía además una versión portable.

## Decisión

### Dos formatos

| Archivo                          | Qué es                                                     | Dónde guarda los datos                 |
| -------------------------------- | ---------------------------------------------------------- | -------------------------------------- |
| `KeepToMyShelf-Setup-<v>.exe`    | Instalador NSIS por usuario, sin permisos de administrador | `%APPDATA%\KeepToMyShelf`              |
| `KeepToMyShelf-Portable-<v>.zip` | Zip que se descomprime y se usa sin instalar               | `KeepToMyShelf Data\`, junto al `.exe` |

- **Instalador:** en español o inglés según el idioma del sistema (`installerLanguages`), con elección de carpeta y acceso directo en el escritorio. **Desinstalar nunca borra los datos** (`deleteAppDataOnUninstall: false`).
- **Zip portable:** contiene una sola carpeta, `KeepToMyShelf\`, para que «Extraer aquí» no desparrame unos 190 archivos. Dentro están `KeepToMyShelf.exe`, todo lo que necesita y la carpeta `KeepToMyShelf Data\` con un `LEEME - README.txt` bilingüe.

### Cómo sabe la app que es portable

**Si existe una carpeta `KeepToMyShelf Data` junto al `.exe` (`process.execPath`), los datos van ahí** (`src/main/infrastructure/user-data-location.ts`). La versión instalada nunca la tiene. Es la misma idea que el modo portable de VS Code (una carpeta `data` junto al ejecutable).

- La carpeta se elige antes de que la app esté lista (`app.setPath('userData', …)`), porque Electron y el bloqueo de instancia única empiezan a usarla enseguida. Por eso la caché de Chromium también queda en la carpeta portable, y la app no deja nada en `%APPDATA%`.
- **Si la carpeta no admite escritura** (Archivos de programa, un USB protegido), la app muestra un mensaje bilingüe con la ruta y sale. Sin esa comprobación no abriría nada, porque el bloqueo de instancia única no se puede crear y Electron sale sin avisar.
- **La carpeta portable tiene prioridad sobre `KTMS_USER_DATA_DIR`.** Así, una prueba del portable define las dos, y un error solo puede acabar en la carpeta temporal de la prueba, nunca en los datos reales.

### Cómo se genera

- `npm run package` compila, ejecuta electron-builder (instalador y `release/<v>/win-unpacked`) y después `scripts/package-portable.mjs`, que crea el zip a partir de `win-unpacked` con yazl (ya era una dependencia por las copias de seguridad).
- El target `zip` de electron-builder no sirve: no puede añadir la carpeta de datos al zip sin añadirla también al instalador, que se genera desde la misma carpeta.
- **Icono:** `build/icon.svg` es la fuente; `scripts/render-icon.mjs` lo convierte con sharp en `build/icon.png` (512 px), del que electron-builder saca el `.ico` del ejecutable, el instalador y los accesos directos. Tres lomos en una estantería: mando, claqueta y televisor.

## Alternativas descartadas

- **El target `portable` de electron-builder** (un solo `.exe`): en cada arranque descomprime toda la app (unos 350 MB) en `%TEMP%` y la borra al cerrar. Medido: **11 s por arranque**, frente a 0,9 s del zip. Ni `unpackDirName` (vuelve a extraer igualmente) ni `compression: store` (423 MB y aún 5 s) lo arreglan. Si la app se cierra de golpe, además deja la copia en `%TEMP%`.
- **Un `.exe` autoextraíble** que cree la carpeta la primera vez (SFX de 7-Zip): electron-builder no lo genera y haría falta una herramienta externa. El resultado es el mismo que descomprimir el zip.
- **Detectar el portable con una variable de entorno o un archivo marcador oculto:** la carpeta de datos ya cumple esa función y, además, el usuario ve dónde están sus datos.

## Consecuencias

- Quien descarga el zip ve el aviso de SmartScreen al abrir el `.exe`, igual que con el instalador (no hay firma de código).
- Para actualizar el portable hay que descomprimir la versión nueva y pasarle la carpeta `KeepToMyShelf Data`. El `LEEME` lo explica.
- El modo portable solo se prueba con la app empaquetada: las E2E usan el Electron de desarrollo, cuyo `.exe` está en `node_modules`. Su prueba automática será la prueba de humo del workflow de release (F12-B).
