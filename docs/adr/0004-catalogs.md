# ADR 0004: Catálogos y relaciones

- **Estado:** aceptada (F5-A implementada; F5-B, F5-C y F5-D pendientes)
- **Fecha:** 2026-10-26

## Contexto

Los elementos se relacionan con valores reutilizables: plataformas, géneros, sagas, empresas, personas, etiquetas y regiones (para las fechas de lanzamiento). Un mismo valor se usa en muchos elementos, y renombrarlo o eliminarlo no debe dejar referencias rotas.

## Decisión

### Ocho catálogos en una sola tabla

`catalog_entry` guarda los valores de los ocho catálogos: `platform`, `game_genre`, `screen_genre`, `tag`, `region`, `company`, `person` y `franchise`. Todos se comportan igual, lo que permite un solo servicio, una sola pantalla de gestión y un solo mecanismo de filtros. Si algún catálogo necesita más datos (por ejemplo, la foto de una persona), se añadirá una tabla complementaria, igual que `series_details`.

- **Unicidad por texto exacto** dentro de cada catálogo: «Hipo», «Hipó» e «HIPO» pueden convivir. Un mismo nombre puede existir en catálogos distintos («Nintendo» como empresa y como saga).
- **La búsqueda ignora mayúsculas y tildes** (`name_key`), también en los alias.
- **Alias («otros nombres»)** en `catalog_entry_alias`, para nombres regionales u otros nombres: Mega Drive ↔ Genesis, Pocket Monsters ↔ Pokémon.
- Los géneros de películas y series pueden limitarse a películas o a series (`scope`; `NULL` = ambos).
- **Cada perfil tiene sus propios catálogos**, porque están en su `library.db`.

### Papeles por tipo de elemento

`item_entry` relaciona un elemento con un valor en un papel (`role`). Qué catálogo alimenta cada papel depende del tipo (`src/core/catalogs/catalogs.ts`):

| Papel                                                   | Videojuegos             | Películas y series                                 |
| ------------------------------------------------------- | ----------------------- | -------------------------------------------------- |
| Sagas (`franchise`)                                     | Sagas                   | Sagas                                              |
| Lo tengo en (`owned_on`) / Publicado en (`released_on`) | Plataformas             | —                                                  |
| Géneros (`genre`)                                       | Géneros de videojuegos  | Géneros de películas y series (respetando `scope`) |
| Desarrolladoras, distribuidoras                         | Empresas                | —                                                  |
| Productoras                                             | —                       | Empresas                                           |
| Directores, actores                                     | —                       | Personas (los actores en el orden elegido)         |
| Compositores                                            | Personas                | Personas                                           |
| Etiquetas                                               | Etiquetas (lista común) | Etiquetas (lista común)                            |

Las fechas de lanzamiento o estreno van en `item_release` (región + fecha parcial).

### Reglas de integridad

- **Renombrar** un valor lo cambia en todos los elementos, porque las relaciones apuntan al identificador. Un nombre que ya existe exactamente en el catálogo se rechaza (`catalog.duplicate_name`). La fusión de duplicados queda como mejora futura, opcional y con sugerencias.
- **Eliminar** un valor lo quita de sus elementos, sin tocar los elementos. Las fechas de una región eliminada se conservan sin región (`ON DELETE SET NULL`).
- El número de usos de cada valor incluye los elementos de la papelera.
- «Eliminar valores sin uso» respeta las regiones usadas por fechas de lanzamiento.
- Sin límites de cantidad. Topes de cordura: 200 caracteres por nombre y 50 alias por valor.

### Listas iniciales

- Plataformas (con alias regionales), géneros de videojuegos, géneros de películas y series, y regiones. Están en `src/main/infrastructure/db/default-catalogs.ts`, fuera de la migración.
- Se copian **una sola vez** en cada perfil, en su idioma: al crearlo o, para los perfiles anteriores, al abrirlo por primera vez (marca en `library_meta`). Después son valores normales: se pueden renombrar o eliminar, y no se traducen ni se vuelven a crear.
- Empresas, personas, sagas y etiquetas empiezan vacías.

### Interfaz (pendiente: F5-C y F5-D)

- **Pantalla «Catálogos»**, accesible desde la selección de modo. Cada catálogo muestra un buscador, el número de usos y las acciones de añadir, renombrar, editar alias y ámbito, eliminar (avisando de cuántos elementos lo usan) y «Eliminar valores sin uso».
- **Etiquetas:** lista común. En «Catálogos» y en los filtros (F7), un selector Videojuegos / Películas / Series / Todas muestra por defecto las del modo actual (las que usa algún elemento de ese tipo). En el formulario se sugieren todas.
- **Formulario:** campos con autocompletado. Las sugerencias nunca se eligen solas; mientras no exista un valor exactamente igual a lo escrito, aparece «Crear "…"». Los valores nuevos se crean al guardar el elemento, en la misma transacción: si se cancela, no queda nada suelto.
- **Orden del formulario y de la ficha:** Identificación (título, títulos alternativos, descripción, sagas) → Mi seguimiento (estado, valoración, fechas de uso, horas, formato, «Lo tengo en», favorito, notas) → Ficha («Publicado en», géneros, fechas de lanzamiento, empresas, personas) → Etiquetas.

## Consecuencias

- Una única implementación para los ocho catálogos.
- La coherencia entre papel y catálogo (por ejemplo, que `developer` apunte a una empresa) se comprueba en el código, no con claves foráneas.
- Copiar catálogos entre perfiles sería una mejora futura opcional.
