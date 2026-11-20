# ADR 0006: Búsqueda, filtros y ordenación

- **Estado:** aceptada e implementada: F7-A (motor), F7-B (buscador y orden), F7-C (cuadrícula virtualizada), F7-D (filtros simples), F7-E (filtros avanzados), v1.1-A (orden natural de los números), v1.1-B (filtros numéricos) y v1.1-C (filtro por colección y orden por fecha de adición)
- **Fecha:** 2026-11-04 (ampliada hasta el 2026-11-06 con las entregas siguientes, el 2026-11-19 con el orden natural y los filtros numéricos, y el 2026-11-20 con la v1.1-C)

## Contexto

Cada biblioteca necesita buscar por título, filtrar con condiciones AND/OR y ordenar, con buen rendimiento en miles de elementos. La especificación pide que un filtro nuevo no obligue a reescribir la búsqueda.

## Decisión

### Árbol de expresiones

Un filtro es un árbol de grupos (`and`, `or`) y condiciones (`src/core/filters/filter-tree.ts`). Antes de consultar, `validateFilter` comprueba el árbol con el registro de campos y sus límites (8 niveles y 500 condiciones). Los grupos vacíos se ignoran: significan «ninguna regla», no «todo» ni «nada».

### Registro de campos

`FILTER_FIELDS` (`src/core/filters/filter-fields.ts`) describe cada campo de forma declarativa: su identificador, los tipos de elemento que lo tienen y de dónde sale el dato. Añadir un campo de un tipo existente consiste en añadir un descriptor. El motor solo cambia si aparece un tipo de campo nuevo.

| Tipo         | Campos                                  | Operadores        |
| ------------ | --------------------------------------- | ----------------- |
| `role`       | Todos los papeles (géneros, etiquetas…) | es, no es         |
| `choice`     | Estado                                  | es, no es         |
| `flag`       | Favorito, Rejugado/Revisionada          | es                |
| `flags`      | Formato (físico, digital)               | es, no es         |
| `rating`     | Valoración                              | ≥, ≤, sin valorar |
| `number`     | Año de lanzamiento, horas, temporadas   | ≥, ≤, sin indicar |
| `collection` | Colecciones (v1.1-C)                    | es, no es         |

Los papeles se filtran por separado aunque compartan catálogo: «Lo tengo en» y «Publicado en» son campos distintos. El filtro por colección funciona como un papel (un `EXISTS` por condición) y se explica en el [ADR 0007](0007-collections.md#mejoras-de-la-v11-c-2026-11-20).

### Campos numéricos (v1.1-B)

El tipo `number` lleva una **medida** (`NUMBER_MEASURES`) con sus límites (`NUMBER_LIMITS`, los mismos que admite el elemento). La consulta obtiene cada medida con una expresión que vale NULL cuando el elemento no tiene el dato (`measureExpression`, en `item-query.ts`):

- **Año de lanzamiento** (los tres tipos; «de estreno» en películas y series): el del **lanzamiento más temprano**, `CAST(substr(MIN(date), 1, 4) AS INTEGER)`, la misma fecha que ordena por lanzamiento. Con «cualquiera de sus lanzamientos», «≥ 1995 Y ≤ 1999» podría cumplirse con dos lanzamientos distintos.
- **Horas jugadas** (videojuegos): el filtro usa horas enteras y la consulta compara con los minutos guardados (`horas × 60`), así que 10:30 está en «como mucho 11» pero no en «como mucho 10».
- **Temporadas** (series): subconsulta a `series_details`; una serie sin fila no tiene el dato.

Como con la valoración, un elemento sin el dato no cumple ≥ ni ≤; «sin indicar» lo busca. En los **filtros simples**, cada número es una sección con «Desde» y «Hasta» que se combinan con AND (cada límite válido cuenta como una marca); «sin indicar» solo está en los **avanzados**, porque en casillas daría «(≥ a Y ≤ b) O sin dato». Un número a medias o imposible no se aplica y la casilla lo marca, igual que una fila avanzada sin completar.

### Consulta

`buildItemListQuery` (`src/main/infrastructure/db/item-query.ts`) genera un único `SELECT`, siempre parametrizado:

- **Relaciones:** un `EXISTS` por condición, así que «Género = RPG AND Género = Acción» significa que el elemento tiene ambos.
- **«No es»:** incluye los elementos sin ese dato. Un juego sin estado «no es» Terminado.
- **Búsqueda:** parcial, con `LIKE` sobre `title_norm` y `item_alt_title.title_norm`, sin distinguir mayúsculas ni acentos. `%`, `_` y `\` se tratan como texto normal.
- **Elementos sin título:** se encuentran por el nombre que muestran («Sin nombre 3»). Ese texto no está guardado y depende del idioma, así que la interfaz envía la etiqueta traducida.
- **Ordenación:** por título, fecha de alta en la biblioteca (`createdAt`, «Fecha de alta» desde la v1.1-C), valoración, fecha de lanzamiento más temprana, inicio o fin de uso. Dentro de una colección, también por la fecha en que se añadió cada elemento (`addedToCollection`, v1.1-C). Lo que no tiene dato por el que ordenar queda siempre al final, también en orden descendente. Los empates siguen el orden por título y, después, el `id`.
- **Fechas parciales:** se ordenan como texto, así que en orden ascendente «2021» queda antes que «2021-03».
- **Orden natural de los números** (v1.1-A): ver el apartado siguiente.
- **Colecciones** (F9): la misma consulta admite «todos los tipos» y limitarse a una colección. Sin tipo no se admiten filtros, porque sus campos dependen del tipo. Ver el [ADR 0007](0007-collections.md).

### Orden natural de los números (v1.1-A)

SQLite compara el texto carácter a carácter, así que «final fantasy 10» quedaba antes que «final fantasy 2». Desde la v1.1-A, los títulos y los nombres de los catálogos, las colecciones y los perfiles se ordenan con los números por su valor:

- **Clave:** `naturalSortKey` (`src/core/text/natural-sort.ts`) sustituye cada grupo de dígitos por su valor sin ceros a la izquierda, precedido de su longitud, y esta de la suya: «2» pasa a ser «112» y «10», «1210». Así, un número más corto siempre va antes y los de igual longitud se comparan cifra a cifra, sea cual sea su tamaño. Las cifras siguen antes que las letras. Los números romanos no se interpretan.
- **Función SQL:** `openDatabase` registra en cada conexión la función determinista `natural_key`, que aplica la clave a `title_norm` o `name_key`: `ORDER BY natural_key(item.title_norm)`. Solo aparece en las consultas, nunca en el esquema, así que cualquier otra herramienta puede seguir abriendo la base de datos.
- **Desempate:** «Agente 007» y «Agente 7» tienen la misma clave; decide el texto normalizado y después el `id`, como antes.
- **Coste:** medido con 10 000 títulos, ordenar pasa de unos 5 ms a 18 ms por consulta. La prueba de 10 000 elementos de `item-list.test.ts` sigue comprobando el límite de 1 s.

Alternativas descartadas:

| Alternativa                                | Por qué se descartó                                                                                                                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Una _collation_ propia                     | better-sqlite3 (13.0) no permite registrarlas: solo funciones, agregados y tablas virtuales                                                                                         |
| Una columna con la clave, en una migración | Hay ocho sitios que escriben nombres y todos tendrían que mantenerla al día. Cambiar el algoritmo exigiría otra migración. El índice que permitiría no hace falta con estos tiempos |
| Ordenar en la interfaz o en el servicio    | El orden por título es también el desempate de los demás criterios; partirlo entre SQL y JavaScript complica el motor                                                               |

### Kysely solo genera el SQL

Kysely construye la consulta y `.compile()` devuelve el SQL y sus parámetros; los ejecuta better-sqlite3. La ejecución de Kysely es asíncrona y los servicios son síncronos, así que usa un `DummyDriver` que nunca llega a ejecutar nada. Así no hay que convertir los servicios a asíncronos. El resto de consultas siguen escritas a mano: Kysely se usa donde el SQL es dinámico.

### Sin paginación ni índices nuevos

`items.list` devuelve todos los resultados y la interfaz virtualiza solo el dibujado. Una prueba con 10 000 elementos comprueba los tiempos y que las tablas relacionadas se leen por sus índices. No hizo falta ninguna migración: los índices existentes cubren los `EXISTS`, y un `LIKE '%…%'` recorre la tabla de todos modos.

### Filtros simples

El estado de las casillas (`simple-filters.ts`) no es un árbol, sino lo marcado en cada atributo. `toFilterTree` lo convierte en el árbol del motor: un grupo `or` por atributo dentro de un grupo `and`. Así, el motor no sabe de dónde viene un filtro.

Los valores que ofrecen salen del canal `items.filterValues`: por papel (`roles`), los que usa algún elemento de ese tipo fuera de la papelera, con sus alias; y por medida (`ranges`, desde la v1.1-B), el mínimo y el máximo, en horas enteras para las horas. Una sección numérica solo aparece si algún elemento tiene el dato (o si hay algo escrito, para poder borrarlo), y su rango se muestra como texto de ejemplo. En los avanzados los números se ofrecen siempre, como la valoración. No se reutiliza la lista de «Catálogos» porque esa cuenta también la papelera y mezcla los papeles que comparten catálogo.

### Filtros avanzados y modos

El constructor (`advanced-filters.ts`) guarda un borrador con la misma forma que el árbol del motor, pero admite filas a medias y un identificador por fila para React. `toAdvancedTree` descarta lo incompleto y genera el árbol, sin cambios en el motor ni en el IPC. La interfaz limita los grupos a 3 niveles; el motor, a 8.

Cada modo guarda su propio estado, en lugar de compartir un solo árbol. Así no hay que traducir de uno a otro, algo imposible en general: un filtro avanzado no siempre cabe en casillas. Solo se aplica el modo en uso (`activeFilterTree`) y el otro se conserva. Los modos son botones con `aria-pressed`, no pestañas ARIA, porque ese patrón cambia de pestaña con las flechas, y aquí cambiar puede abrir una confirmación.

### Cuadrícula virtualizada

`LibraryGrid` (`src/renderer/features/library/`) usa TanStack Virtual (`useVirtualizer` sobre el área que se desplaza, `#app-scroll`; hasta la F10, `useWindowVirtualizer`) y solo dibuja las filas cercanas a lo visible, más tres por cada lado.

- **Por filas:** virtualizar filas conserva la alineación por abajo dentro de cada una. El número de columnas se calcula con el ancho disponible y la misma regla que antes (mínimo 10 rem por tarjeta).
- **Alturas variables:** se estiman con el tamaño de las portadas (`grid-layout.ts`) y se sustituyen por la altura real al medir la fila.
- **Posición al volver:** se guarda el primer elemento visible, no los píxeles, porque la altura de las filas no dibujadas es una estimación. Su fila queda arriba de la ventana, y se recupera también al cambiar el número de columnas. Con el ancho mínimo de la ventana (960 px) y el máximo del contenido (64 rem) hoy siempre caben 5 columnas, así que esto solo se nota si esos límites cambian.
- **Hueco de la barra de scroll:** en la biblioteca siempre está reservado (`scrollbar-gutter: stable`, en el área que se desplaza desde la F10). Si no, una página que casi cabe entra en un bucle sin fin: la barra estrecha las portadas, la página pasa a caber, la barra desaparece, las portadas crecen y la barra vuelve. Lo encontró la CI, con una pantalla más estrecha que la del equipo de desarrollo.
- **Accesibilidad:** `role="list"` y `role="listitem"` con `aria-setsize` y `aria-posinset`, porque las filas impiden usar `<ul>` y `<li>` directamente.

Medido con 10 000 elementos en el mismo equipo:

| Acción                       | Antes     | Después |
| ---------------------------- | --------- | ------- |
| Tarjetas en la página        | 10 000    | 35      |
| Ver resultados tras escribir | 13 708 ms | 348 ms  |
| Limpiar la búsqueda          | 6292 ms   | 354 ms  |
| Cambiar el orden             | 9670 ms   | 98 ms   |

## Alternativas consideradas

| Alternativa              | Por qué se descartó                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| FTS5                     | No hace falta con estos volúmenes. Se puede adoptar más adelante sin cambiar la API               |
| Paginar por IPC          | Complica el orden, el recuento y el scroll, sin necesidad demostrada                              |
| Un `JOIN` por relación   | Duplica filas y hace que dos condiciones sobre el mismo papel no signifiquen «tiene ambos»        |
| Virtualización propia    | Medir alturas y corregir el scroll es lo más propenso a errores, y habría que mantenerlo          |
| CSS `content-visibility` | React seguiría creando y revisando todas las tarjetas, así que no arregla la lentitud al escribir |
| Filtrar en la interfaz   | Obligaría a enviarle todas las relaciones de todos los elementos                                  |

## Consecuencias

- Por IPC solo llegan identificadores del registro y valores parametrizados, nunca nombres de columna ni SQL.
- `core/filters` conoce los nombres de algunas columnas de `item`, porque el registro es único. No contiene SQL.
- Si un filtro apunta a un valor eliminado del catálogo, no encuentra nada. La interfaz deberá quitar esa condición.
