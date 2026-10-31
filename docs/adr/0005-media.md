# ADR 0005: Almacenamiento de imágenes y documentos

- **Estado:** aceptada; F6-A implementada (almacenamiento, miniaturas y protocolo)
- **Fecha:** 2026-10-31

## Contexto

Los elementos tienen portada, galería de imágenes y documentos PDF (manuales, guías). La especificación pide que la app siga funcionando aunque el usuario mueva o borre sus archivos, que no se dupliquen, que se validen tipo y tamaño, que la biblioteca no cargue imágenes grandes y que la interfaz, aislada por seguridad, no pueda leer el disco.

## Decisión

### Copias gestionadas, nombradas por su hash

- Al importar, el archivo se **copia** a la carpeta del perfil; el original del usuario nunca se modifica ni se vuelve a leer.
- Cada archivo se nombra con el **SHA-256 de sus bytes** (`ab12…ef.png`), dentro de una subcarpeta con sus dos primeros caracteres. El nombre nunca depende de lo que escribe el usuario, y dos archivos con el mismo nombre tienen siempre el mismo contenido: así se evitan los duplicados.
- **Dos carpetas**, para que el usuario las encuentre con facilidad:
  - `media\files\`: los archivos que usan los elementos;
  - `media\originals\`: los originales guardados junto a una copia optimizada.

  Dentro de cada carpeta no hay duplicados. Si los mismos bytes hacen falta en las dos, hay una copia idéntica en cada una.

- `media\.tmp\` guarda las importaciones en preparación y se vacía al abrir el perfil.
- `cache\thumbs\` guarda las miniaturas, que se pueden borrar: se regeneran al pedirlas.

### Modelo de datos (migración 0004)

- `media_file`: un archivo guardado (`sha256`, `store`, formato, tamaño, dimensiones ya orientadas, animado). `UNIQUE (sha256, store)`. Una copia optimizada apunta a su original con `original_id` (`ON DELETE SET NULL`).
- `item_media`: qué archivos tiene cada elemento y en qué orden (`sort_order`), con `label` para el nombre visible de los documentos. Imágenes y documentos son dos listas; **la primera imagen es la portada**, sin columna aparte. `media_id` es `ON DELETE RESTRICT`: la base de datos no deja borrar un archivo en uso.
- Las reglas se duplican como `CHECK` (un documento siempre es PDF y nunca va a `originals`, una imagen tiene dimensiones, un original no apunta a otro…).

### Importación en dos pasos

1. **Preparar** (asíncrono): se lee la firma del archivo para conocer su formato por el **contenido**, no por la extensión (JPEG, PNG, WebP, AVIF, GIF o PDF; SVG y HEIC se rechazan). Después se comprueba el tamaño máximo (50 MB por imagen y 200 MB por PDF), sharp verifica que la imagen se puede decodificar, y se generan la copia optimizada y las miniaturas. Todo queda en `.tmp` y se devuelve un resumen con los tamaños de cada opción, para que la ventana de importación pueda mostrarlos.
2. **Confirmar** (síncrono): según la elección (`original`, `optimized_with_original` u `optimized_only`), se colocan los archivos y se escriben las filas.

- **Optimizar:** se aplica la orientación EXIF, el lado mayor se reduce a 2000 px como máximo (nunca se amplía) y se recomprime en WebP con calidad 90. Se eliminan los metadatos (EXIF, GPS). Un original guardado los conserva.
- **Imágenes animadas:** solo se pueden guardar como original.
- **Miniaturas:** WebP de 320 y 640 px de lado mayor, con la proporción de la imagen. Las animadas muestran su primer fotograma.
- Antes de escribir en el perfil se vuelve a comprobar el token de sesión, porque el usuario puede haber cambiado de perfil mientras sharp trabajaba.

### La base de datos manda

- Primero se borran las filas y después un **barrido** elimina las filas de archivos que nadie usa y los archivos y miniaturas sin fila.
  - Un original se conserva mientras lo use una copia; el barrido repite hasta que no queda nada que borrar.
  - Solo toca archivos con el nombre de un archivo guardado: un archivo del usuario en esas carpetas no se borra nunca.
- El barrido se ejecuta tras quitar un archivo, tras eliminar definitivamente un elemento, tras vaciar la papelera y al abrir el perfil.
- Un elemento en la papelera conserva sus archivos, y mientras está en ella no se pueden cambiar.
- **Sin carreras:** la confirmación coloca los archivos y escribe las filas sin ningún `await` entre medias, y el barrido también es síncrono. Como el proceso principal ejecuta un solo hilo de JavaScript, un barrido nunca puede ver un archivo colocado cuya fila aún no existe.
- Si Windows no deja borrar un archivo porque otro programa lo tiene abierto, se avisa en la consola y el siguiente barrido lo reintenta.
- Un archivo borrado a mano aparece con `isMissing`, para que la interfaz muestre un aviso discreto.

### Protocolo `ktms-media://`

- La interfaz carga las imágenes con `ktms-media://file/<sha256>` y `ktms-media://thumb/<sha256>/<320|640>`, nunca con `file://`.
- El esquema se declara como `standard` y `secure` (`protocol.registerSchemesAsPrivileged`) antes de que la app esté lista, y se atiende con `protocol.handle`. La CSP lo admite solo en `img-src`.
- La URL se analiza de forma estricta: el hash debe ser hexadecimal de 64 caracteres, el tamaño uno de los dos de miniatura, y no se admiten consultas, puertos ni partes de más.
- Solo se sirven archivos de `files` que existan en la base del **perfil abierto**. Los originales guardados no se sirven nunca.
- El tipo MIME sale de la base de datos y la respuesta lleva `X-Content-Type-Options: nosniff`.
- El manejador usa los tipos web `Request`/`Response`, así que se prueba con Vitest sin Electron.

## Alternativas descartadas

- **Guardar la ruta del archivo original** en lugar de copiarlo: se rompe en cuanto el usuario lo mueve, y la interfaz necesitaría acceso al disco.
- **Una sola carpeta**, con los originales marcados solo en la base de datos: evitaría las copias idénticas, pero el usuario no podría localizar sus originales en el explorador de archivos.
- **Servir los archivos con `file://`:** daría a la interfaz acceso a cualquier ruta del disco.
- **Una columna `cover_id`:** es redundante con el orden, y se podría desincronizar.

## Consecuencias

- Restaurar una copia de seguridad (F11) exige incluir la carpeta `media`; `cache` se puede regenerar.
- Cambiar el tamaño de las miniaturas solo exige vaciar la caché.
- Las preparaciones viven en memoria del proceso principal. Al cerrar la app o cambiar de perfil se pierden, y sus archivos temporales se borran en la siguiente apertura.
