# ADR 0009: Copias de seguridad de los perfiles

- **Estado:** aceptada; implementadas la F11-A (crear copias, copia antes de eliminar un perfil y retención) y la F11-B1 (motor de restauración). La interfaz de la restauración llega en la F11-B2.
- **Fecha:** 2026-11-13; restauración, 2026-11-14

## Contexto

Desde la F1, cada base de datos se copia antes de migrarla (ver el [ADR 0002](0002-database-migrations.md)), pero esas copias solo contienen la base de datos y nunca se borraban. La F11 añade copias que el usuario puede guardar y restaurar, con las imágenes y los documentos (ver el [ADR 0005](0005-media.md)), y una copia automática antes de eliminar un perfil.

## Decisión

### Una copia por perfil, en un `.zip`

```
manifest.json        formato, versión, app, fecha, motivo, nombre del perfil, versión del esquema,
                     preferencias propias del perfil, hash de su fondo importado (opcional)
                     y recuento de archivos
library.db           instantánea de la biblioteca (VACUUM INTO)
media/files/ab/ab12…ef.webp
media/originals/ab/ab12…ef.png
```

- **Un perfil por copia**, no la app entera: es lo que se restaura y se mueve entre equipos.
- **La instantánea es coherente** aunque el perfil esté abierto: `VACUUM INTO` se hace en una transacción de lectura.
- **Solo entran los archivos que lista la instantánea**, no todo lo que haya en `media`. Una imagen importada después de la instantánea no está en ella.
- **Las miniaturas no entran**: se regeneran al pedirlas.
- **Las imágenes y los PDF se guardan sin comprimir** (ya lo están); la base de datos y el manifiesto, comprimidos.
- **Las preferencias propias del perfil** (no las globales) van en el manifiesto. Si su fondo es importado, el manifiesto guarda además su SHA-256 (`importedBackground`, desde la F11-B1): en otra instalación, el mismo id puede ser otra imagen.
- **Un archivo borrado a mano** no se incluye, y el manifiesto lo cuenta en `media.missing`. La interfaz avisa de cuántos faltan.
- **Formato versionado:** `format: "keeptomyshelf-backup"` y `formatVersion: 1`. `librarySchemaVersion` permite migrar al restaurar una copia antigua.

### Escritura

- **Librería:** yazl para escribir y yauzl para leer. Ambas trabajan por _streams_, sin cargar los archivos enteros en memoria, y admiten ZIP64 (más de 4 GB). Se descartaron fflate (en memoria y sin ZIP64) y escribir el formato a mano.
- **Nunca queda un zip a medias con el nombre bueno:** se escribe en `<destino>.<uuid>.partial` y se renombra al terminar. Si falla, se borra el `.partial` y el error llega como `backup.write_failed`.
- **Si falla mientras lee archivos**, se cierran antes de devolver el error, porque Windows no deja borrar un archivo abierto.
- **La carpeta de trabajo** es `backups\.tmp` (la instantánea). Se vacía al terminar y al arrancar la app, junto con los `.partial` que dejara un cierre inesperado.
- **Una sola copia o restauración a la vez** (`backup.busy`): las dos comparten un `BackupLock`.
- **El barrido de la multimedia se suspende mientras se escribe** (`MediaService.holdSweeps`). Si el usuario quita una imagen durante la copia, su archivo no se borra hasta que la copia termina, porque la instantánea lo necesita. El barrido aplazado se hace al final si el perfil sigue abierto.

### Copia manual

- Desde Ajustes, solo con un perfil abierto (sección «Copias de seguridad»).
- El proceso principal abre «Guardar como» (`dialog.showSaveDialog`) en Documentos, con el nombre `KeepToMyShelf - <perfil> - <fecha hora>.zip`. La interfaz solo recibe el nombre del archivo guardado, nunca la ruta.

### Copia automática antes de eliminar un perfil

- `ProfileService.delete` es asíncrono: comprueba que el perfil se puede eliminar, hace la copia y vuelve a comprobarlo antes de borrar.
- **Si la copia falla, el perfil no se elimina** (`profile.backup_failed`).
- Si la carpeta del perfil ya no tiene biblioteca (se borró fuera de la app), no hay nada que copiar y se elimina sin copia.
- Se guarda en `%APPDATA%\KeepToMyShelf\backups\` como `<fecha hora:segundos> - <perfil> - before-delete.zip`. El nombre empieza por la fecha para que el explorador las ordene. Dos en el mismo segundo reciben «(2)», «(3)»…
- «Abrir la carpeta de copias automáticas», en Ajustes, la abre con `shell.openPath`.

### Retención

- **Copias automáticas** (`before-delete` y `before-restore`): se conservan las **10 más recientes** de todos los perfiles juntos. Solo se borran archivos con el nombre de una copia automática; una copia manual guardada en esa carpeta no se toca nunca.
- **Copias previas a migrar:** se conservan las **5 más recientes de cada base de datos**, por la fecha de su nombre (no por la versión: v10 es posterior a v9). Las de `app.db` están también en `backups\`, junto a las automáticas, y se distinguen por el nombre.
- Un archivo que Windows no deja borrar se queda para la vez siguiente, con un aviso en la consola: la limpieza nunca impide abrir la base de datos ni terminar una copia.

### Progreso: el primer evento del proceso principal a la interfaz

- Hasta ahora, toda la comunicación era petición y respuesta (`ipcRenderer.invoke`). El progreso va al revés: el proceso principal lo envía por su cuenta con `webContents.send('backups:progress', { doneBytes, totalBytes })`.
- `IpcEvents`, en `shared/ipc.ts`, reúne estos canales. El preload expone `backups.onProgress(listener)`, que devuelve la función para dejar de escuchar; la interfaz nunca toca `ipcRenderer`.
- Se envía un evento al empezar (0 bytes) y después solo cuando cambia el porcentaje entero, no por cada trozo leído.
- Cada evento lleva su etapa (`stage`): `backup` al escribir una copia y `restore` al extraer una. Restaurar sobre el perfil abierto pasa por las dos.

### Restauración (F11-B1)

`RestoreService` restaura una copia **como perfil nuevo** o **sobre el perfil abierto**. Nada se sustituye hasta que la copia entera se ha extraído y comprobado.

**Validación**, en este orden:

1. **Solo las entradas que puede tener una copia:** `manifest.json`, `library.db` y `media/(files|originals)/<xx>/<sha256>.<ext>`, con `<xx>` igual al principio del hash (`core/backups/backup-entries.ts`). Cualquier otra, una repetida o una cifrada rechaza el archivo entero (`backup.invalid_file`). yauzl ya rechaza `..`, las rutas absolutas y `\` (`strictFileNames`). La ruta de destino se construye con el hash y el formato, nunca con el nombre de la entrada: así no hay _zip slip_.
2. **El manifiesto**, con zod: `format`, `formatVersion` no mayor que 1 y `librarySchemaVersion` no mayor que el de la app (si no, `backup.too_new`), y tantos archivos de media como dice.
3. **La extracción**, por _streams_, a `profiles\.restoring-<uuid>\` (en el mismo disco que el destino, así que renombrar la carpeta es instantáneo). **yauzl no comprueba el CRC-32**, así que lo comprueba el lector en cada entrada; además, cada archivo de media debe coincidir con su SHA-256 (`backup.damaged`).
4. **La base de datos:** `integrity_check`, `foreign_key_check` y `user_version` igual al del manifiesto. Una copia antigua se migra ahí mismo, así que reabrirla después no puede fallar.

Los errores del disco (espacio, permisos) se distinguen de los de la copia por su `syscall` y llegan como `backup.restore_failed`.

**Como perfil nuevo:** id nuevo, nombre del manifiesto con «(1)» si ya existe, fecha de creación la de la restauración y sus preferencias propias.

**Sobre el perfil abierto**, que conserva su nombre:

1. La interfaz pide un resumen de la copia (`preview`), que devuelve un `restoreId`; la ruta se queda en el proceso principal. Solo vale el último, y solo en la misma sesión (`backup.restore_expired`).
2. Se extrae y se valida la copia.
3. Se guarda la copia automática `before-restore` del estado actual; si falla, no se restaura nada (`backup.safety_backup_failed`).
4. Se cierra la sesión, la carpeta del perfil pasa a `.deleted-<uuid>` y la extraída ocupa su lugar. Los renombrados se reintentan durante un segundo si Windows retiene algún archivo; si el segundo falla, se deshace el primero.
5. Se sustituyen sus preferencias propias por las de la copia y se reabre la sesión con un **token nuevo**. Si algo falla después de cerrarla, el perfil se reabre tal como estaba y se informa del error.

**Preferencias de la copia:** las desconocidas (de una versión más nueva) y los valores no válidos se ignoran, con un aviso en la consola. El fondo importado se busca por su hash; si no está en la galería, el perfil sigue el fondo global. En las copias anteriores a la F11-B1, sin hash, se conserva el id solo si existe.

Al arrancar se borran las carpetas `.restoring-*` que dejara un cierre inesperado.

- La ventana de progreso aparece con el primer evento, no mientras «Guardar como» está abierto. No se puede cerrar: Chromium solo deja que una página rechace Esc una vez sin un clic en medio, así que, si se cierra igualmente, se vuelve a abrir.

## Consecuencias

- La restauración confía en un formato con manifiesto y versión, y en que cada archivo de media se llama como su hash: comprueba cada uno.
- Durante una restauración conviven en el disco la copia extraída y los datos actuales; si falta espacio, falla sin cambiar nada.
- Eliminar un perfil grande tarda lo que tarde su copia, con la barra de progreso.
- La carpeta `backups\` puede crecer hasta 10 copias completas de perfiles; se indica en Ajustes.
