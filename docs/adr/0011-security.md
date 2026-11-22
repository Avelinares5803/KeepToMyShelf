# ADR 0011: Seguridad de la aplicación

- **Estado:** aceptada; la base viene de la F0 y se reforzó en la F12-A3, antes de publicar la v1.0. Ampliada en la v1.1-E con arrastrar y soltar.
- **Fecha:** 2026-11-17; actualizada el 2026-11-22

## Contexto

KeepToMyShelf es una app local, sin servidor ni cuentas, pero muestra contenido que llega de fuera (imágenes, PDF, copias de seguridad) y su interfaz es una página web dentro de Electron. Si alguien consiguiera ejecutar código en esa página, no debería poder leer el disco ni actuar en nombre de la app. Antes de publicar la v1.0 se revisó la app siguiendo la [lista de seguridad de Electron](https://www.electronjs.org/docs/latest/tutorial/security).

## Decisión

### Aislamiento de la interfaz (desde la F0)

- `contextIsolation`, `sandbox` y `nodeIntegration: false`: la página no tiene Node ni acceso al disco. Solo usa las funciones del preload, que únicamente reenvían mensajes IPC.
- Todo lo que llega por IPC se valida con zod. Los errores inesperados llegan a la interfaz solo como `internal`, sin rutas ni trazas.
- La interfaz nunca maneja rutas del disco: los diálogos se abren en el proceso principal (y, al soltar archivos, la ruta la obtiene el preload; ver más abajo), y las imágenes se sirven con `ktms-media://`, un protocolo estricto (sin `..`, solo hashes e identificadores conocidos) que no sirve documentos.
- React escapa todo el texto; no se usa `innerHTML`, `eval` ni `dangerouslySetInnerHTML`.
- Las consultas SQL usan parámetros; las partes interpoladas son fragmentos fijos del código.
- Los archivos importados se validan por su contenido, no por la extensión; los SVG se rechazan porque pueden llevar scripts. Las copias de seguridad se comprueban contra rutas maliciosas (_zip slip_), hashes y CRC (ADR 0009).
- Las herramientas de desarrollo solo se abren en desarrollo; la app empaquetada no tiene menú ni atajo para ellas.

### Refuerzo de la F12-A3

- **Ningún permiso web.** Electron concede por defecto todo lo que pide una página (cámara, micrófono, ubicación, notificaciones…). La app no usa ninguno, así que `setPermissionRequestHandler` y `setPermissionCheckHandler` los rechazan todos (`src/main/security.ts`).
- **Solo la página de la app puede llamar por IPC.** Cada mensaje se acepta solo si viene del marco principal y su URL es la de la app: el `index.html` empaquetado o el servidor de desarrollo. Si no, devuelve `ipc.forbidden_sender`. Hoy nada más puede mostrarse en la ventana; esto lo mantiene así si algún día cambia.
- **Ninguna ventana nueva ni `<webview>`.** La app no tiene enlaces externos, así que `window.open` se rechaza siempre, sin abrir tampoco el navegador. La navegación fuera de la página ya estaba bloqueada.
- **CSP más estricta:** a `default-src 'self'; script-src 'self'` se añaden `object-src 'none'`, `frame-src 'none'`, `base-uri 'none'` y `form-action 'none'`. `style-src` mantiene `'unsafe-inline'`, porque React usa estilos en línea; no permite ejecutar código.
- **Fusibles de Electron** (`electronFuses` en `electron-builder.yml`), grabados en el `.exe`:

  | Fusible                                 | Valor       | Por qué                                                                                                                                                       |
  | --------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `runAsNode`                             | Desactivado | El `.exe` no puede usarse como Node con `ELECTRON_RUN_AS_NODE`. Además, la app abre bien desde la terminal de VS Code, que define esa variable                |
  | `enableNodeOptionsEnvironmentVariable`  | Desactivado | `NODE_OPTIONS` no puede inyectar código al arrancar                                                                                                           |
  | `enableEmbeddedAsarIntegrityValidation` | Activado    | Si se modifica `app.asar`, la app no arranca. Electron comprueba cada bloque al leerlo                                                                        |
  | `onlyLoadAppFromAsar`                   | Activado    | La app solo se carga desde su `app.asar`, nunca desde una carpeta `app` puesta al lado                                                                        |
  | `enableNodeCliInspectArguments`         | Activado    | Playwright lo necesita para manejar la app empaquetada en la prueba de humo del release. Solo lo podría usar quien ya puede ejecutar programas con el usuario |

  Comprobado con la app empaquetada (2026-11-17): con `ELECTRON_RUN_AS_NODE=1` abre la app en lugar de ejecutar Node, y con un byte cambiado en el código o en el índice del `app.asar` no arranca.

### Arrastrar y soltar (v1.1-E)

Desde el 2026-11-22 se pueden soltar imágenes y PDF desde el Explorador en la portada, la galería y los documentos del formulario del elemento. Un archivo soltado puede venir de cualquier sitio, así que, a diferencia del diálogo «Abrir», que abre el proceso principal, la ruta tiene que salir de la página sin que esta la pueda inventar:

- **La interfaz sigue sin manejar rutas.** `window.api.media.prepareDropped` recibe solo los objetos `File` del arrastre. El preload obtiene la ruta de cada uno con `webUtils.getPathForFile` (Electron ya no pone la ruta en `File.path`) y la envía él mismo por el canal `media:prepare-dropped`. Un `File` creado por la página no tiene ruta (`''`), y un objeto que no sea un `File` hace fallar a `getPathForFile`: la página no puede pedir que se lea un archivo que el usuario no ha soltado.
- **El proceso principal comprueba cada ruta antes de leer nada** (`droppedPathProblem` en `core` y `assertDroppedFile` en la infraestructura):
  - Una ruta vacía se rechaza con `media.not_on_disk`. Es el caso de una imagen arrastrada desde un navegador, que no está en el disco.
  - Las rutas que empiezan por dos barras (`\\servidor\…`, `//…`, `\\?\UNC\…` y las de dispositivo `\\.\…`, `\\?\…`) se rechazan con `media.network_path` sin tocarlas. En Windows, abrir una ruta de red puede enviar al servidor una huella de la contraseña de la sesión (NTLM).
  - `lstat`, que no sigue los enlaces, rechaza las carpetas, los dispositivos y los enlaces simbólicos con `media.not_a_regular_file`.
  - Después, la importación pasa por las mismas comprobaciones de contenido, tipo y tamaño que con el diálogo.
- **Cada zona acepta solo lo suyo**: la portada y la galería, imágenes; los documentos, PDF. La portada rechaza a la vez varios archivos soltados. Fuera de una zona, la interfaz cancela `dragover` con el cursor de «no permitido», así que soltar no hace nada. La navegación al archivo ya estaba bloqueada por `will-navigate`.
- **Una unidad de red con letra** (`Z:`) no se distingue de un disco local sin llamadas nativas, así que se acepta: la ha configurado el propio usuario. La amenaza que se evita es una ruta UNC hacia un servidor ajeno.
- La ventana de tiempo entre `lstat` y la lectura es la misma que con el diálogo, y se acepta.
- Arrastrar fondos en Ajustes o la portada de una colección queda fuera; si se añade, usará este mismo mecanismo.

## Fuera del alcance

- **Los datos no se cifran en el disco**, como en la mayoría de apps de catálogo locales: quien tenga acceso a la cuenta de Windows puede leerlos.
- **Los PDF se abren con el visor del sistema:** un PDF malicioso afecta a ese visor, no a la app. La app abre una copia y nunca el archivo guardado (ADR 0005).
- **Sin firma de código** (ADR 0010): Windows muestra el aviso de SmartScreen.
- **La página se carga desde `file://`.** Servirla con un protocolo propio permitiría desactivar también el fusible `grantFileProtocolExtraPrivileges`; está anotado como mejora.

## Consecuencias

- Una función nueva que necesite un permiso web (por ejemplo, la cámara) tendrá que concederlo expresamente en `denyAllPermissions`.
- Un enlace externo en la interfaz necesitará volver a permitir `shell.openExternal`, solo para `https://`.
- Las pruebas E2E de `tests/e2e/security.spec.ts` comprueban los permisos, la CSP y las ventanas nuevas; `src/main/security.test.ts`, la comprobación de quién llama por IPC.
- Arrastrar y soltar: `src/preload/index.test.ts` comprueba que el preload solo envía las rutas de `webUtils`; `src/core/media/dropped-path.test.ts` y `tests/integration/media/dropped-files.test.ts`, las rutas rechazadas; `tests/e2e/drag-and-drop.spec.ts`, las zonas con archivos reales del disco.
