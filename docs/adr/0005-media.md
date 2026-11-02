# ADR 0005: Almacenamiento de imágenes y documentos

- **Estado:** aceptada; implementadas la F6-A (almacenamiento, miniaturas y protocolo), la F6-B1 (guardado con el elemento, selector de archivos y ventana de importación), la F6-B2 (portadas, ficha y visor) y la F6-B3 (portada independiente de la galería)
- **Fecha:** 2026-10-31 (ampliada el 2026-11-01 con la F6-B1 y el 2026-11-02 con la F6-B2 y la F6-B3)

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

- `media\.tmp\` guarda las importaciones en preparación. Se vacía al cerrar el perfil (cambiar de perfil o salir de la app) y, tras un cierre inesperado, al volver a abrirlo.
- `cache\thumbs\` guarda las miniaturas, que se pueden borrar: se regeneran al pedirlas.

### Modelo de datos (migración 0004)

- `media_file`: un archivo guardado (`sha256`, `store`, formato, tamaño, dimensiones ya orientadas, animado). `UNIQUE (sha256, store)`. Una copia optimizada apunta a su original con `original_id` (`ON DELETE SET NULL`).
- `item_media`: qué archivos tiene cada elemento y en qué orden (`sort_order`), con `label` para el nombre visible de los documentos. Imágenes (la galería) y documentos son dos listas. `media_id` es `ON DELETE RESTRICT`: la base de datos no deja borrar un archivo en uso.
- `item.cover_media_id` (migración 0005, F6-B3): la portada, aparte de la galería. También es `ON DELETE RESTRICT`. Unos triggers impiden que sea un documento o un original guardado, porque un `CHECK` no puede consultar otra tabla. Hasta la F6-B3, la portada era la primera imagen de la galería; al migrar, esa imagen pasó a ser la portada y siguió en la galería.
- Las reglas se duplican como `CHECK` (un documento siempre es PDF y nunca va a `originals`, una imagen tiene dimensiones, un original no apunta a otro…).

### Importación en dos pasos

1. **Preparar** (asíncrono): se lee la firma del archivo para conocer su formato por el **contenido**, no por la extensión (JPEG, PNG, WebP, AVIF, GIF o PDF; SVG y HEIC se rechazan). Después se comprueba el tamaño máximo (50 MB por imagen y 200 MB por PDF), sharp verifica que la imagen se puede decodificar, y se generan la copia optimizada y las miniaturas. Todo queda en `.tmp` y se devuelve un resumen con los tamaños de cada opción, para que la ventana de importación pueda mostrarlos.
2. **Confirmar** (síncrono): según la elección (`original`, `optimized_with_original` u `optimized_only`), se colocan los archivos y se escriben las filas.

- **Optimizar:** se aplica la orientación EXIF, el lado mayor se reduce al máximo de Ajustes (2000 px por defecto; nunca se amplía) y se recomprime en WebP con calidad 90. Se eliminan los metadatos (EXIF, GPS). Un original guardado los conserva.
- **Imágenes animadas:** solo se pueden guardar como original.
- **Miniaturas:** WebP de 320 y 640 px de lado mayor, con la proporción de la imagen. Las animadas muestran su primer fotograma.
- Antes de escribir en el perfil se vuelve a comprobar el token de sesión, porque el usuario puede haber cambiado de perfil mientras sharp trabajaba.

### Las imágenes se guardan con el elemento (F6-B1)

- En el formulario, las imágenes forman parte del borrador. `items.create` e `items.update` reciben la **galería completa** en su orden (`images`) y, desde la F6-B3, la **portada** (`cover`, o `null` para quitarla). Cada entrada es una de estas:
  - una imagen que ya tiene (su portada o una de su galería);
  - una importación preparada con su elección;
  - «usar el original» de una imagen que ya tiene.

  Si no se envía la galería o la portada, no cambian.

- `MediaService.stageMedia` lo comprueba todo y **copia** (no mueve) los archivos a su sitio antes de la transacción. `ItemService` escribe el elemento, la portada y la galería en **una sola transacción**.
- **La misma imagen como portada y en la galería** («Usar como portada»): es un solo archivo, al que apuntan `item.cover_media_id` y una fila de `item_media`. Si es una importación aún no guardada, la misma preparación aparece en las dos listas y se guarda una vez.
  - Si falla, el barrido borra lo copiado y las importaciones siguen disponibles para reintentar.
  - Si tiene éxito, se liberan las importaciones usadas y, si se quitó alguna imagen, se barre.
- **«Usar el original»** copia el original de `originals` a `files`. La copia optimizada y el original dejan de usarse y el barrido los elimina.
- **Selector de archivos:** `media:pick-images` abre el diálogo del sistema en el proceso principal y prepara los archivos elegidos uno tras otro. Los rechazados se devuelven con su código. **La interfaz nunca recibe ni envía rutas del disco**, solo identificadores de importación.
- `ktms-media://prepared/<id>/<320|640>` sirve las miniaturas de las importaciones aún no guardadas, solo a la sesión que las preparó.
- La elección de la ventana de importación puede recordarse como preferencia del perfil (`imageImportChoice`). Con una elección recordada, si la copia optimizada no ocupa menos (o la imagen es animada) se usa el original sin preguntar.

### Mostrar las imágenes (F6-B2)

- **Portadas en las listas:** `ItemSummary.cover` es la portada de cada elemento, con su hash y su tamaño. Sale de un `LEFT JOIN` sobre `item.cover_media_id` en la misma consulta de la lista, en la biblioteca y en la papelera (en la F6-B2 era un `ROW_NUMBER()` sobre la galería).
- **Visor:** la portada se abre sola; una imagen de la galería abre la galería en esa imagen.
- **Miniaturas en pantalla:** `<img>` con `srcset` (320 px, o 640 px en HiDPI), `loading="lazy"` y su ancho y alto guardados, para que el hueco esté reservado antes de cargar.
- **Visor:** muestra el archivo completo (`ktms-media://file/…`), nunca en la cuadrícula ni en la ficha.
- **Archivo borrado a mano:** `media.list` lo marca con `isMissing` (la ficha muestra «Archivo no encontrado»), y el protocolo deja de servir sus miniaturas aunque sigan en la caché, para que el aviso sea el mismo en todas partes. En la biblioteca, una portada que no se puede cargar deja la tarjeta solo con el título.

### La base de datos manda

- Primero se borran las filas y después un **barrido** elimina las filas de archivos que nadie usa (ni una galería, ni unos documentos, ni una portada) y los archivos y miniaturas sin fila.
  - Un original se conserva mientras lo use una copia; el barrido repite hasta que no queda nada que borrar.
  - Solo toca archivos con el nombre de un archivo guardado: un archivo del usuario en esas carpetas no se borra nunca.
- El barrido se ejecuta tras quitar un archivo, tras eliminar definitivamente un elemento, tras vaciar la papelera y al abrir el perfil.
- Un elemento en la papelera conserva sus archivos, y mientras está en ella no se pueden cambiar.
- **Sin carreras:** el guardado coloca los archivos y escribe las filas sin ningún `await` entre medias, y el barrido también es síncrono. Como el proceso principal ejecuta un solo hilo de JavaScript, un barrido nunca puede ver un archivo colocado cuya fila aún no existe.
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
- **La primera imagen como portada, sin columna propia** (la decisión inicial, hasta la F6-B2): evitaba una columna redundante con el orden, pero obligaba a entender una regla implícita, y añadir una imagen a la galería de un elemento sin portada la convertía en portada sin pedirlo. Con la portada independiente, la columna ya no es redundante.
- **Una columna `role` en `item_media`** (`cover` o `gallery`): habría que reconstruir la tabla, y con su clave (elemento, archivo) la misma imagen no podría ser portada y estar en la galería.

## Consecuencias

- Restaurar una copia de seguridad (F11) exige incluir la carpeta `media`; `cache` se puede regenerar.
- Cambiar el tamaño de las miniaturas solo exige vaciar la caché.
- Las preparaciones viven en memoria del proceso principal y se descartan, con sus archivos temporales, al cerrar el perfil.
- Las pruebas E2E no pueden manejar el diálogo nativo de archivos: lo sustituyen en el proceso principal (`app.evaluate`) para que devuelva imágenes de prueba.
