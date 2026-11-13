# ADR 0009: Copias de seguridad de los perfiles

- **Estado:** aceptada; implementada la F11-A (crear copias, copia antes de eliminar un perfil y retención). La restauración llega en la F11-B.
- **Fecha:** 2026-11-13

## Contexto

Desde la F1, cada base de datos se copia antes de migrarla (ver el [ADR 0002](0002-database-migrations.md)), pero esas copias solo contienen la base de datos y nunca se borraban. La F11 añade copias que el usuario puede guardar y restaurar, con las imágenes y los documentos (ver el [ADR 0005](0005-media.md)), y una copia automática antes de eliminar un perfil.

## Decisión

### Una copia por perfil, en un `.zip`

```
manifest.json        formato, versión, app, fecha, motivo, nombre del perfil, versión del esquema,
                     preferencias propias del perfil y recuento de archivos
library.db           instantánea de la biblioteca (VACUUM INTO)
media/files/ab/ab12…ef.webp
media/originals/ab/ab12…ef.png
```

- **Un perfil por copia**, no la app entera: es lo que se restaura y se mueve entre equipos.
- **La instantánea es coherente** aunque el perfil esté abierto: `VACUUM INTO` se hace en una transacción de lectura.
- **Solo entran los archivos que lista la instantánea**, no todo lo que haya en `media`. Una imagen importada después de la instantánea no está en ella.
- **Las miniaturas no entran**: se regeneran al pedirlas.
- **Las imágenes y los PDF se guardan sin comprimir** (ya lo están); la base de datos y el manifiesto, comprimidos.
- **Las preferencias propias del perfil** (no las globales) van en el manifiesto.
- **Un archivo borrado a mano** no se incluye, y el manifiesto lo cuenta en `media.missing`. La interfaz avisa de cuántos faltan.
- **Formato versionado:** `format: "keeptomyshelf-backup"` y `formatVersion: 1`. `librarySchemaVersion` permite migrar al restaurar una copia antigua.

### Escritura

- **Librería:** yazl para escribir y yauzl para leer (por ahora, solo en las pruebas). Ambas trabajan por _streams_, sin cargar los archivos enteros en memoria, y admiten ZIP64 (más de 4 GB). Se descartaron fflate (en memoria y sin ZIP64) y escribir el formato a mano.
- **Nunca queda un zip a medias con el nombre bueno:** se escribe en `<destino>.<uuid>.partial` y se renombra al terminar. Si falla, se borra el `.partial` y el error llega como `backup.write_failed`.
- **Si falla mientras lee archivos**, se cierran antes de devolver el error, porque Windows no deja borrar un archivo abierto.
- **La carpeta de trabajo** es `backups\.tmp` (la instantánea). Se vacía al terminar y al arrancar la app, junto con los `.partial` que dejara un cierre inesperado.
- **Una sola copia a la vez** (`backup.busy`).
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

- **Copias automáticas:** se conservan las **10 más recientes** de todos los perfiles juntos. Solo se borran archivos con el nombre de una copia automática; una copia manual guardada en esa carpeta no se toca nunca.
- **Copias previas a migrar:** se conservan las **5 más recientes de cada base de datos**, por la fecha de su nombre (no por la versión: v10 es posterior a v9). Las de `app.db` están también en `backups\`, junto a las automáticas, y se distinguen por el nombre.
- Un archivo que Windows no deja borrar se queda para la vez siguiente, con un aviso en la consola: la limpieza nunca impide abrir la base de datos ni terminar una copia.

### Progreso: el primer evento del proceso principal a la interfaz

- Hasta ahora, toda la comunicación era petición y respuesta (`ipcRenderer.invoke`). El progreso va al revés: el proceso principal lo envía por su cuenta con `webContents.send('backups:progress', { doneBytes, totalBytes })`.
- `IpcEvents`, en `shared/ipc.ts`, reúne estos canales. El preload expone `backups.onProgress(listener)`, que devuelve la función para dejar de escuchar; la interfaz nunca toca `ipcRenderer`.
- Se envía un evento al empezar (0 bytes) y después solo cuando cambia el porcentaje entero, no por cada trozo leído.
- La ventana de progreso aparece con el primer evento, no mientras «Guardar como» está abierto. No se puede cerrar: Chromium solo deja que una página rechace Esc una vez sin un clic en medio, así que, si se cierra igualmente, se vuelve a abrir.

## Consecuencias

- La restauración (F11-B) puede confiar en un formato con manifiesto y versión, y en que cada archivo de media se llama como su hash: puede comprobar cada uno.
- Eliminar un perfil grande tarda lo que tarde su copia, con la barra de progreso.
- La carpeta `backups\` puede crecer hasta 10 copias completas de perfiles; se indica en Ajustes.
