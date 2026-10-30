# ADR 0004: Catálogos y relaciones

- **Estado:** aceptada e implementada (F5-A a F5-E)
- **Fecha:** 2026-10-26 (países de origen añadidos el 2026-10-30)

## Contexto

Los elementos se relacionan con valores reutilizables: plataformas, géneros, sagas, empresas, personas, etiquetas y regiones (para las fechas de lanzamiento). Un mismo valor se usa en muchos elementos, y renombrarlo o eliminarlo no debe dejar referencias rotas.

## Decisión

### Nueve catálogos en una sola tabla

`catalog_entry` guarda los valores de los nueve catálogos: `platform`, `game_genre`, `screen_genre`, `tag`, `region`, `company`, `person`, `franchise` y `country` (países de origen, añadido en la migración 0003). Todos se comportan igual, lo que permite un solo servicio, una sola pantalla de gestión y un solo mecanismo de filtros. Si algún catálogo necesita más datos (por ejemplo, la foto de una persona), se añadirá una tabla complementaria, igual que `series_details`.

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
| Países de origen (`origin_country`)                     | Países                  | Países                                             |
| Etiquetas                                               | Etiquetas (lista común) | Etiquetas (lista común)                            |

Las fechas de lanzamiento o estreno van en `item_release` (región + fecha parcial). Puede haber varias por elemento, sin región o repitiendo región (relanzamientos).

Los **países de origen** tienen su propio catálogo, separado de las regiones: las regiones de lanzamiento son mercados (Europa, Norteamérica, Mundial…), mientras que el origen es siempre un país. Por eso «Japón» puede estar en las dos listas como valores independientes.

### Guardar un elemento

- Cada papel recibe una lista ordenada de referencias: un valor existente o un nombre nuevo. Al editar, las listas y las fechas se sustituyen enteras.
- Los nombres nuevos se crean en la misma transacción que el elemento. Si ya existe un valor con exactamente ese nombre (creado entretanto en otra ventana), se reutiliza.
- Un valor repetido en el mismo papel se guarda una vez; en papeles distintos, una vez por papel.
- Se rechazan, como red de seguridad (el formulario no los ofrece): papeles que no corresponden al tipo, valores de otro catálogo y géneros limitados al otro tipo.

### Reglas de integridad

- **Renombrar** un valor lo cambia en todos los elementos, porque las relaciones apuntan al identificador. Un nombre que ya existe exactamente en el catálogo se rechaza (`catalog.duplicate_name`). La fusión de duplicados queda como mejora futura, opcional y con sugerencias.
- **Eliminar** un valor lo quita de sus elementos, sin tocar los elementos. Las fechas de una región eliminada se conservan sin región (`ON DELETE SET NULL`).
- El número de usos de cada valor incluye los elementos de la papelera.
- «Eliminar valores sin uso» respeta las regiones usadas por fechas de lanzamiento.
- Sin límites de cantidad. Topes de cordura: 200 caracteres por nombre y 50 alias por valor.

### Listas iniciales

- Plataformas, géneros de videojuegos, géneros de películas y series (los tres con alias), regiones y países (con alias). Están en `src/main/infrastructure/db/default-catalogs.ts`, fuera de la migración.
- Se copian **una sola vez** en cada perfil, en su idioma: al crearlo o, para los perfiles anteriores, al abrirlo por primera vez (marca en `library_meta`). Después son valores normales: se pueden renombrar o eliminar, y no se traducen ni se vuelven a crear.
- Añadir valores a una lista existente no los lleva a los perfiles que ya la recibieron. Un catálogo nuevo, en cambio, tiene su propia marca y llega una vez a todos los perfiles (así se hizo con los países).
- Empresas, personas, sagas y etiquetas empiezan vacías.

### Interfaz

- **Pantalla «Catálogos»**, accesible desde la selección de modo y desde cada biblioteca. Cada catálogo muestra un buscador (también por alias), el número de usos y las acciones de añadir, renombrar, editar alias y ámbito, eliminar (avisando de cuántos elementos lo usan) y «Eliminar valores sin uso».
- **Catálogos compartidos** (sagas, empresas, personas y etiquetas): en «Catálogos» y en los filtros (F7), un selector Videojuegos / Películas / Series / Todos muestra los valores que usa algún elemento de ese tipo. Empieza en el tipo de la biblioteca desde la que se abre, o en «Todos» desde la selección de modo. Los valores sin uso solo aparecen en «Todos», que es donde se pueden eliminar en bloque. En el formulario se sugieren todos.
- **Formulario:** campos con autocompletado (también por alias, mostrando el alias que coincide). Las sugerencias nunca se eligen solas: se eligen con clic o con las flechas y Enter. Mientras no exista un valor exactamente igual a lo escrito, aparece «Crear "…"», que también hay que elegir; Enter sin sugerencia marcada solo añade un valor exactamente igual a lo escrito, así que nunca se crea un valor sin querer. Los valores nuevos se marcan como «nuevo» y se crean al guardar el elemento, en la misma transacción: si se cancela, no queda nada suelto. El reparto se ordena con botones ← →; en los demás papeles se guarda el orden en que se añaden.
- **Orden del formulario y de la ficha:**
  - Identificación: título, títulos alternativos, descripción, sagas.
  - Mi seguimiento: estado, valoración, fechas de uso, horas, formato, «Lo tengo en», favorito, notas.
  - Ficha. Videojuegos: «Publicado en», géneros, distribuidoras, desarrolladoras, música, fechas de lanzamiento. Películas y series: (temporadas y capítulos en series), géneros, productoras, dirección, reparto, música, fechas de estreno.
  - Etiquetas.

## Consecuencias

- Una única implementación para los ocho catálogos.
- La coherencia entre papel y catálogo (por ejemplo, que `developer` apunte a una empresa) se comprueba en el código, no con claves foráneas.
- Copiar catálogos entre perfiles sería una mejora futura opcional.
