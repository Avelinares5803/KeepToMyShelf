# ADR 0008: Fondos de pantalla

- **Estado:** aceptada; implementada la F10-A (motor, sin cambios visibles)
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
| `backgroundImportChoice` | igual que `imageImportChoice`, pero aparte                                            | `ask`              |
| `backgroundMaxSide`      | 1920, 2560, 3840, 5120 o 7680 px                                                      | 3840               |

- Un fondo importado se guarda por el `id` de su fila de `files`.
- **Escribir** un fondo importado que no existe falla con `background.not_found`.
- **Borrar un fondo** cambia a `{ kind: 'none' }`, en la misma transacción, la preferencia global y las de los perfiles que lo usaban. Así, esos perfiles vuelven a «Sin fondo», y no al fondo global, que podría ser otro.
- **Leer** una referencia a un fondo que no existe (solo si alguien edita `app.db` a mano) da «Sin fondo», con un aviso en la consola.
- `list()` indica cuántos perfiles muestran cada fondo, para avisar al borrarlo.

### Protocolo

- `ktms-media://background/<sha256>` y `ktms-media://background/<sha256>/<320|640>` sirven solo fondos de la galería (nunca los originales), haya o no un perfil abierto.
- Las rutas de imágenes de un perfil y de fondos no se cruzan: un hash de un perfil no se sirve como fondo, ni al revés.
- Las miniaturas de una importación de fondo en preparación usan la ruta de siempre (`prepared/<id>/<size>`), porque los ids son UUID aleatorios. Así, la ventana de importación no cambia.

### IPC

`backgrounds:list`, `backgrounds:pick`, `backgrounds:import`, `backgrounds:discard-imports` y `backgrounds:delete`. Ninguno exige sesión. `pick` acepta un token o `null`.

## Alternativas descartadas

- **Guardar los fondos en la carpeta de cada perfil:** la galería no sería común, y el selector de perfiles necesitaría abrir cada `library.db`.
- **Una carpeta sin tabla, listando los archivos:** no habría dónde guardar las dimensiones ni el enlace al original, y se perdería «la base de datos manda».
- **Volver al fondo global al borrar un fondo** (borrar la preferencia propia del perfil): el perfil podría pasar a otro fondo que nunca eligió.
- **Compartir `imageImportChoice` con las portadas:** es razonable guardar las portadas como originales y los fondos, que suelen ser enormes, optimizados.

## Consecuencias

- Las copias de seguridad (F11) tendrán que incluir `backgrounds\` junto a `app.db`. `backgrounds\cache` se regenera.
- La interfaz (F10-B y F10-C) solo necesita los canales `backgrounds:*` y las preferencias; los fondos predeterminados son imágenes de la propia app (`'self'`), así que la CSP no cambia.
