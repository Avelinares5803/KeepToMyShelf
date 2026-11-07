# ADR 0007: Colecciones

- **Estado:** aceptada; implementada la F9-A (motor, sin cambios visibles)
- **Fecha:** 2026-11-07

## Contexto

La especificación pide colecciones personalizadas con nombre, portada opcional y elementos elegidos a mano («Juegos favoritos», «Películas pendientes»). La pertenencia no debe duplicar los elementos, y las colecciones deben seguir siendo coherentes cuando se elimina un elemento. Pide también analizar si conviene mezclar videojuegos, películas y series.

## Decisión

### Colecciones mixtas

Una colección puede tener elementos de los tres tipos, y su pantalla los filtra por tipo («Todo», «Videojuegos», «Películas», «Series»). Dos de los cuatro ejemplos de la especificación («Favoritos», «Series que quiero recomendar») tienen sentido con varios tipos, y separarlas obligaría a crear tres colecciones para una sola idea. Si alguien quiere una de un solo tipo, basta con no mezclar.

### Modelo de datos (migración 0006)

- `collection`: nombre, `name_key` (el nombre sin mayúsculas ni tildes, `UNIQUE`), portada (`cover_media_id`) y fechas. Tiene `uuid`, como los elementos, para una futura exportación.
- `collection_item`: qué elementos tiene cada colección, con la fecha en que se añadieron. La clave es (colección, elemento), así que un elemento está una sola vez en cada colección.
- **Guarda referencias, nunca copias:** las dos claves foráneas son `ON DELETE CASCADE`. Borrar una colección borra sus pertenencias, nunca sus elementos; eliminar un elemento definitivamente lo quita de sus colecciones.
- **Papelera:** la pertenencia no cambia al enviar un elemento a la papelera. Las consultas lo ocultan (`deleted_at IS NULL`) y vuelve al restaurarlo. Los recuentos no cuentan la papelera.
- **Sin orden manual:** los elementos se ordenan con los mismos criterios que la biblioteca. `added_at` aún no se usa; se guarda porque luego no se podría recuperar.

### Nombres

Obligatorios, de 1 a 100 caracteres, con las mismas reglas de limpieza que los títulos. Dos nombres que solo se diferencian en mayúsculas o tildes se rechazan (`collection.duplicate_name`), porque no se podrían distinguir al elegir una colección. El servicio lo comprueba para dar un error traducible, y el índice `UNIQUE` lo garantiza.

Es un criterio distinto al de los catálogos (texto exacto) y al de los perfiles (sufijo «(1)»): en un catálogo, «Ys» e «YS» pueden ser cosas distintas, y en los perfiles el sufijo evita bloquear la creación; aquí el usuario elige el nombre y es mejor avisarle.

### Portada

- Es opcional y pasa por la misma ventana de importación que la de los elementos. `collection.cover_media_id` es `ON DELETE RESTRICT`, con los mismos triggers que `item.cover_media_id`: solo admite imágenes de `files`, nunca un documento ni un original guardado.
- `MediaService.stageCollectionCover` usa el mismo camino que la portada de un elemento: comprueba la imagen, copia los archivos antes de la transacción y escribe la fila dentro de ella. Si falla, el barrido borra lo copiado y la importación se puede reintentar.
- La portada «existente» solo puede ser la que ya tiene esa colección. Usar la portada de un elemento como portada de una colección queda como mejora.
- **El barrido tiene en cuenta las portadas de colección.** Sin eso, intentaría borrar un archivo protegido por `RESTRICT`, fallaría, y como hay un barrido al abrir el perfil, el perfil no se podría abrir. Una prueba lo cubre.

### Consultas

- `buildItemListQuery` admite `kind = null` (todos los tipos) y `collectionId`, que añade un `EXISTS` sobre `collection_item`. Así, la colección reutiliza la búsqueda y la ordenación de la biblioteca.
- **Sin filtros por atributo en las colecciones:** los campos de filtro dependen del tipo (plataformas solo en videojuegos, reparto solo en películas y series), y con «Todo» no hay un registro de campos que aplicar. El motor lo impide: un filtro sin tipo es un error de programación.

### Cambiar pertenencias

`collections.changeMemberships` recibe solo los cambios (`add` y `remove`, pares colección-elemento), nunca la lista completa. Una lista completa enviada por la interfaz, que no muestra la papelera, borraría las pertenencias de los elementos que están en ella. Los cambios se aplican en una sola transacción, todos o ninguno:

- añadir un elemento que ya está, o quitar uno que no está, no hace nada;
- no se puede añadir un elemento de la papelera (`item.in_trash`);
- añadir y quitar el mismo par a la vez es un error (`collection.invalid_change`).

La misma operación sirve para la ventana de la colección (un elemento en varias colecciones) y para la de la ficha (varios elementos en una colección).

### Borrar una colección

Es definitivo, sin papelera, con confirmación en la interfaz. Solo contiene un nombre, una portada y referencias, así que una papelera no compensa su complejidad.

## Alternativas descartadas

- **Colecciones de un solo tipo:** más sencillas de filtrar, pero obligan a repetir colecciones para una misma idea.
- **Una colección como un filtro guardado (colección «inteligente»):** la especificación pide elegir los elementos a mano. Podría añadirse más adelante como otra cosa.
- **Copiar los elementos en la colección:** la especificación lo prohíbe y rompería la edición.
- **Sustituir la lista completa de miembros:** perdería las pertenencias de los elementos en la papelera.
- **Una etiqueta especial en lugar de una tabla:** mezclaría catálogos y colecciones, y una etiqueta no tiene portada.

## Consecuencias

- Las copias de seguridad (F11) incluyen las colecciones sin hacer nada más: viven en `library.db`, y sus portadas en `media`.
- Un filtro «Colección» en las bibliotecas necesitaría un tipo de campo nuevo en el registro de filtros.
- Las pantallas llegan en la F9-B (lista, crear, editar, borrar y la colección con su tipo, búsqueda y orden) y la F9-C (añadir y quitar elementos desde la colección y desde la ficha).
