# ADR 0010: Distribución en Windows

- **Estado:** aceptada; implementada en la F12-A (icono, instalador y zip portable) y la F12-B (workflow de release y prueba de humo).
- **Fecha:** 2026-11-16; release, 2026-11-17

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

### Cómo se publica (F12-B)

El procedimiento está en [RELEASING.md](../RELEASING.md).

- **`release.yml`**, al subir una etiqueta `v*`, tiene dos trabajos:
  - **`build`** (Windows, solo lectura): comprueba que la etiqueta coincide con la versión de `package.json`, hace las mismas comprobaciones que la CI con las E2E, empaqueta, hace la prueba de humo y escribe `SHA256SUMS.txt`.
  - **`release`** (Linux, `contents: write`): crea el borrador con `gh release create --draft --verify-tag`, marcado como _pre-release_ si la versión lleva sufijo (`-rc.1`). Usa la CLI `gh` del runner y el token del workflow, sin acciones de terceros. El texto sale de la plantilla `.github/release-notes.md`, y el responsable añade los cambios al publicar.
- **Prueba de humo** (`npm run test:smoke` → `scripts/smoke-test.ps1` → `tests/smoke/`, con su propia `playwright.smoke.config.ts`):
  - Instala el `.exe` en silencio en una carpeta temporal (`/S /D=…`), comprueba que se registró como programa instalado, prueba la app instalada y la desinstala, comprobando que no queda ni la app ni su registro.
  - Descomprime el zip y prueba la app portable.
  - En cada una, Playwright abre el `.exe` real (`_electron.launch({ executablePath })`), comprueba la versión, que está empaquetada y dónde guarda los datos, crea y abre un perfil, y comprueba que se rechazan los permisos web. Una segunda prueba arranca el `.exe` con `ELECTRON_RUN_AS_NODE=1` y comprueba que no actúa como Node (fusible `runAsNode`, ADR 0011).
  - La app siempre recibe una carpeta temporal (`KTMS_USER_DATA_DIR`), y el script se niega a empezar si KeepToMyShelf ya está instalado en el usuario, porque el instalador sustituiría esa instalación.
- **Versiones:** SemVer. La primera versión publicada es la 1.0.0; el workflow se prueba antes con `v1.0.0-rc.1`.

## Alternativas descartadas

- **El target `portable` de electron-builder** (un solo `.exe`): en cada arranque descomprime toda la app (unos 350 MB) en `%TEMP%` y la borra al cerrar. Medido: **11 s por arranque**, frente a 0,9 s del zip. Ni `unpackDirName` (vuelve a extraer igualmente) ni `compression: store` (423 MB y aún 5 s) lo arreglan. Si la app se cierra de golpe, además deja la copia en `%TEMP%`.
- **Un `.exe` autoextraíble** que cree la carpeta la primera vez (SFX de 7-Zip): electron-builder no lo genera y haría falta una herramienta externa. El resultado es el mismo que descomprimir el zip.
- **Detectar el portable con una variable de entorno o un archivo marcador oculto:** la carpeta de datos ya cumple esa función y, además, el usuario ve dónde están sus datos.
- **Publicar con el `publish` de electron-builder o con una acción de terceros** (`softprops/action-gh-release`): el primero necesita un token en el paso que compila y ejecuta código de npm; la segunda añade una dependencia que hay que vigilar. `gh` ya está en el runner.
- **Sacar el texto del release del `CHANGELOG.md` automáticamente:** para pocas versiones no compensa; el responsable lo copia al publicar el borrador.

## Consecuencias

- Quien descarga el zip ve el aviso de SmartScreen al abrir el `.exe`, igual que con el instalador (no hay firma de código).
- Para actualizar el portable hay que descomprimir la versión nueva y pasarle la carpeta `KeepToMyShelf Data`. El `LEEME` lo explica.
- El modo portable solo se prueba con la app empaquetada: las E2E usan el Electron de desarrollo, cuyo `.exe` está en `node_modules`. Lo prueba la prueba de humo, en cada release y con `npm run test:smoke` en local.
- `release.yml` solo se ejecuta al subir una etiqueta: un cambio en él se prueba de verdad con una versión candidata (`-rc.N`), cuyo borrador se borra después.
