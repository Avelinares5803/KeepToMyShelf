# ADR 0008: Fondos de pantalla

- **Estado:** aceptada; implementada toda la F10: la F10-A (motor, sin cambios visibles), la F10-B (el fondo en la app y en Ajustes), la F10-C1 (atenuación) y la F10-C2 (el fondo de cada perfil)
- **Fecha:** 2026-11-10

## Contexto

La F10 permite elegir un fondo para la aplicación: uno de los que trae la app o una imagen importada, con un desenfoque ajustable. Los fondos importados forman una **galería común a todos los perfiles**, y el fondo tiene que verse **sin ningún perfil abierto**: en el selector de perfiles y al crear uno.

Hasta ahora, todo lo multimedia (ver el [ADR 0005](0005-media.md)) pertenece a un perfil: `MediaService` exige el token de sesión y el protocolo `ktms-media://` solo sirve archivos del perfil abierto.

## Decisión

### Datos: tabla `background_file` en `app.db` (migración `app/0002`)

- Es la misma idea que `media_file`, sin perfil: hash SHA-256, carpeta (`files` u `originals`), formato, tamaño, dimensiones, animada y `original_id` hacia el original guardado. `UNIQUE (sha256, store)`.
- Solo imágenes: el formato no admite PDF.
- La galería son las filas de `files`. Las de `originals` solo existen mientras una copia las use.

### Archivos: `backgrounds\` junto a `app.db`

```
backgrounds\files\ab\ab12…ef.webp        fondos de la galería
backgrounds\originals\ab\ab12…ef.jpg     originales junto a una copia optimizada
backgrounds\.tmp\<id>\                   importaciones en preparación; se vacía al arrancar
backgrounds\cache\thumbs\ab\…-320.webp   miniaturas regenerables
```

Se reutiliza `MediaStore`, así que los nombres, las subcarpetas y la escritura sin archivos a medias son los de la F6.

### Servicio: `BackgroundService`, sin token

- **Preparar** (`prepareMany`) y **confirmar** (`commitImport`), como las portadas, con la misma ventana de importación y las tres opciones (original, optimizada con original, solo optimizada).
  - A diferencia de las portadas, no hay borrador: confirmar añade el fondo a la galería al momento.
  - La misma imagen importada dos veces devuelve el fondo que ya existe.
- **El token es opcional:** solo indica qué preferencias se aplican al preparar (las del perfil abierto o, sin perfil, las globales). Las importaciones no pertenecen a ningún perfil, así que abrir o cerrar uno no las descarta. Se descartan al cancelar la ventana o al arrancar la app.
- **Lo común con las portadas** (detectar el formato por el contenido, comprobar el tamaño, optimizar, hacer miniaturas, escribir la preparación y elegir los archivos según la opción) se sacó de `MediaService` a `infrastructure/media/prepared-import.ts`. Los dos servicios lo usan.
- **La base de datos manda:** borrar quita la fila y después un barrido elimina los originales sin copia y los archivos y miniaturas sin fila. Solo se tocan archivos con nombre de archivo guardado.

### Preferencias

Cuatro preferencias nuevas, con el sistema de siempre (perfil → global → predeterminado, y «Aplicar a todos los perfiles»):

| Clave                    | Valor                                                                                 | Predeterminado     |
| ------------------------ | ------------------------------------------------------------------------------------- | ------------------ |
| `background`             | `{ kind: 'none' }`, `{ kind: 'preset', id }` (6 diseños) o `{ kind: 'imported', id }` | `{ kind: 'none' }` |
| `backgroundBlur`         | entero de 0 a 40 (píxeles CSS)                                                        | 8                  |
| `backgroundDimLight`     | entero de 0 a 90 (% del velo en el tema claro; F10-C1)                                | 40                 |
| `backgroundDimDark`      | entero de 0 a 90 (% del velo en el tema oscuro; F10-C1)                               | 62                 |
| `backgroundImportChoice` | igual que `imageImportChoice`, pero aparte                                            | `ask`              |
| `backgroundMaxSide`      | 1920, 2560, 3840, 5120 o 7680 px                                                      | 3840               |

- Un fondo importado se guarda por el `id` de su fila de `files`.
- **Escribir** un fondo importado que no existe falla con `background.not_found`.
- **Borrar un fondo** cambia a `{ kind: 'none' }`, en la misma transacción, la preferencia global y las de los perfiles que lo usaban. Así, esos perfiles vuelven a «Sin fondo», y no al fondo global, que podría ser otro.
- **Leer** una referencia a un fondo que no existe (solo si alguien edita `app.db` a mano) da «Sin fondo», con un aviso en la consola.
- `list()` indica cuántos perfiles muestran cada fondo, para avisar al borrarlo.

### Perfiles (F10-C2)

- `profiles.create` acepta un fondo, que se guarda como preferencia propia del perfil en la misma transacción que lo crea; un fondo importado que no existe la hace fallar sin dejar nada.
- Cada `Profile` lleva su fondo propio (`ownBackground`), o `null` si sigue al global (`SettingsService.getOwnForProfile`). La tarjeta resuelve «el propio o el global» en la interfaz, con la miniatura del fondo. Se descartó devolver el fondo ya resuelto: al cambiar el global, la lista se volvía a pedir antes de que se guardara y las tarjetas quedaban con el valor anterior.

### Protocolo

- `ktms-media://background/<sha256>` y `ktms-media://background/<sha256>/<320|640>` sirven solo fondos de la galería (nunca los originales), haya o no un perfil abierto.
- Las rutas de imágenes de un perfil y de fondos no se cruzan: un hash de un perfil no se sirve como fondo, ni al revés.
- Las miniaturas de una importación de fondo en preparación usan la ruta de siempre (`prepared/<id>/<size>`), porque los ids son UUID aleatorios. Así, la ventana de importación no cambia.

### IPC

`backgrounds:list`, `backgrounds:pick`, `backgrounds:import`, `backgrounds:discard-imports` y `backgrounds:delete`. Ninguno exige sesión. `pick` acepta un token o `null`.

### Interfaz (F10-B)

- **Capa de fondo** (`AppBackground`): una `<img>` fija detrás de toda la interfaz (`z-index: -1`), con `filter: blur()`. Es más grande que la ventana en el doble del desenfoque por cada lado, para que el borde desenfocado no se aclare. Encima va el **velo**: el color del tema (`color-mix`), para que el texto se lea sobre cualquier imagen. Si la imagen no se puede cargar, no se muestra fondo.
- **Atenuación (F10-C1):** la opacidad del velo es una preferencia por tema, porque el mismo velo no sienta igual en claro que en oscuro. `useShownTheme` resuelve «Según el sistema» con `prefers-color-scheme` (que sigue al tema nativo que fija `applyTheme`) y se actualiza si el sistema cambia. El deslizador de la atenuación y el del desenfoque son el mismo componente, `PeekSlider`.
- **Legibilidad con un fondo:** la barra superior tiene su propio velo, y los textos grises secundarios que van directamente sobre el fondo usan un gris más contrastado (`.app-shell:has(> .app-background)` redefine `--color-muted`). Sin ellos, con poca atenuación en el tema claro, el número junto al título y las migas de pan no se leían sobre fondos oscuros.
- **Predeterminados:** 6 SVG propios en `src/renderer/assets/backgrounds/`, nítidos (sin `feGaussianBlur`), para que el desenfoque dependa solo del deslizador. Vite los incluye en la interfaz (como `data:` si son pequeños), así que la CSP no cambia.
- **Ajustes, sección «Fondo»:**
  - La cuadrícula usa botones de opción nativos, transparentes sobre cada miniatura: el teclado funciona sin código propio.
  - Importar reutiliza `ImageImportDialog` con la preferencia propia de los fondos. El fondo importado pasa a ser el fondo al momento.
  - Borrar vuelve a leer la galería antes de confirmar, para decir cuántos perfiles lo usan en ese momento.
- **Desenfoque:** mientras se mueve el deslizador, `App` guarda una vista previa que la capa muestra al momento; al soltar (`pointerup` en la ventana, o `keyup`), se guarda una vez. Mientras se sostiene, Ajustes se desvanece (clase `dialog--peeking`) y solo queda la fila del deslizador, siempre en la misma posición, para que no se mueva bajo el puntero.
- **Cambios de preferencias optimistas:** `App` muestra el valor nuevo antes de guardarlo y lo deshace si falla. Si no, un control controlado por React, como un botón de opción, volvería un instante al valor anterior.
- **La ventana no se desplaza; lo hace `<main>`** (`#app-scroll`, ver `lib/scroll-area.ts`). Chromium pinta el hueco de la barra de la ventana con el color del tema y encoge con él la zona de los elementos fijos: quedaba una franja a la derecha y el fondo saltaba al entrar en la biblioteca, que reserva ese hueco. El hueco de la barra de un elemento, en cambio, es transparente, y su carril también (`scrollbar-color`), así que la barra se dibuja sobre el fondo. Además, la barra superior queda siempre visible. Las barras superpuestas de Chromium (`--enable-features=OverlayScrollbar`) lo habrían evitado, pero Electron 44 en Windows las ignora.

## Alternativas descartadas

- **Guardar los fondos en la carpeta de cada perfil:** la galería no sería común, y el selector de perfiles necesitaría abrir cada `library.db`.
- **Una carpeta sin tabla, listando los archivos:** no habría dónde guardar las dimensiones ni el enlace al original, y se perdería «la base de datos manda».
- **Volver al fondo global al borrar un fondo** (borrar la preferencia propia del perfil): el perfil podría pasar a otro fondo que nunca eligió.
- **Compartir `imageImportChoice` con las portadas:** es razonable guardar las portadas como originales y los fondos, que suelen ser enormes, optimizados.

## Consecuencias

- Las copias de seguridad (F11) tendrán que incluir `backgrounds\` junto a `app.db`. `backgrounds\cache` se regenera.
- La interfaz (F10-B y F10-C) solo necesita los canales `backgrounds:*` y las preferencias; los fondos predeterminados son imágenes de la propia app (`'self'`), así que la CSP no cambia.
