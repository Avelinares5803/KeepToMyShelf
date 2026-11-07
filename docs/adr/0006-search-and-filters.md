# ADR 0006: Búsqueda, filtros y ordenación

- **Estado:** aceptada e implementada: F7-A (motor), F7-B (buscador y orden), F7-C (cuadrícula virtualizada), F7-D (filtros simples) y F7-E (filtros avanzados)
- **Fecha:** 2026-11-04 (ampliada hasta el 2026-11-06 con las entregas siguientes)

## Contexto

Cada biblioteca necesita buscar por título, filtrar con condiciones AND/OR y ordenar, con buen rendimiento en miles de elementos. La especificación pide que un filtro nuevo no obligue a reescribir la búsqueda.

## Decisión

### Árbol de expresiones

Un filtro es un árbol de grupos (`and`, `or`) y condiciones (`src/core/filters/filter-tree.ts`). Antes de consultar, `validateFilter` comprueba el árbol con el registro de campos y sus límites (8 niveles y 500 condiciones). Los grupos vacíos se ignoran: significan «ninguna regla», no «todo» ni «nada».

### Registro de campos

`FILTER_FIELDS` (`src/core/filters/filter-fields.ts`) describe cada campo de forma declarativa: su identificador, los tipos de elemento que lo tienen y de dónde sale el dato. Añadir un campo de un tipo existente consiste en añadir un descriptor. El motor solo cambia si aparece un tipo de campo nuevo.

| Tipo     | Campos                                  | Operadores        |
| -------- | --------------------------------------- | ----------------- |
| `role`   | Todos los papeles (géneros, etiquetas…) | es, no es         |
| `choice` | Estado                                  | es, no es         |
| `flag`   | Favorito, Rejugado/Revisionada          | es                |
| `flags`  | Formato (físico, digital)               | es, no es         |
| `rating` | Valoración                              | ≥, ≤, sin valorar |

Los papeles se filtran por separado aunque compartan catálogo: «Lo tengo en» y «Publicado en» son campos distintos.

### Consulta

`buildItemListQuery` (`src/main/infrastructure/db/item-query.ts`) genera un único `SELECT`, siempre parametrizado:

- **Relaciones:** un `EXISTS` por condición, así que «Género = RPG AND Género = Acción» significa que el elemento tiene ambos.
- **«No es»:** incluye los elementos sin ese dato. Un juego sin estado «no es» Terminado.
- **Búsqueda:** parcial, con `LIKE` sobre `title_norm` y `item_alt_title.title_norm`, sin distinguir mayúsculas ni acentos. `%`, `_` y `\` se tratan como texto normal.
- **Elementos sin título:** se encuentran por el nombre que muestran («Sin nombre 3»). Ese texto no está guardado y depende del idioma, así que la interfaz envía la etiqueta traducida.
- **Ordenación:** por título, fecha de adición, valoración, fecha de lanzamiento más temprana, inicio o fin de uso. Lo que no tiene dato por el que ordenar queda siempre al final, también en orden descendente. Los empates siguen el orden por título y, después, el `id`.
- **Fechas parciales:** se ordenan como texto, así que en orden ascendente «2021» queda antes que «2021-03».
- **Colecciones** (F9): la misma consulta admite «todos los tipos» y limitarse a una colección. Sin tipo no se admiten filtros, porque sus campos dependen del tipo. Ver el [ADR 0007](0007-collections.md).

### Kysely solo genera el SQL

Kysely construye la consulta y `.compile()` devuelve el SQL y sus parámetros; los ejecuta better-sqlite3. La ejecución de Kysely es asíncrona y los servicios son síncronos, así que usa un `DummyDriver` que nunca llega a ejecutar nada. Así no hay que convertir los servicios a asíncronos. El resto de consultas siguen escritas a mano: Kysely se usa donde el SQL es dinámico.

### Sin paginación ni índices nuevos

`items.list` devuelve todos los resultados y la interfaz virtualiza solo el dibujado. Una prueba con 10 000 elementos comprueba los tiempos y que las tablas relacionadas se leen por sus índices. No hizo falta ninguna migración: los índices existentes cubren los `EXISTS`, y un `LIKE '%…%'` recorre la tabla de todos modos.

### Filtros simples

El estado de las casillas (`simple-filters.ts`) no es un árbol, sino lo marcado en cada atributo. `toFilterTree` lo convierte en el árbol del motor: un grupo `or` por atributo dentro de un grupo `and`. Así, el motor no sabe de dónde viene un filtro.

Los valores que ofrecen salen del canal `items.filterValues`: por papel, los que usa algún elemento de ese tipo fuera de la papelera, con sus alias. No se reutiliza la lista de «Catálogos» porque esa cuenta también la papelera y mezcla los papeles que comparten catálogo.

### Filtros avanzados y modos

El constructor (`advanced-filters.ts`) guarda un borrador con la misma forma que el árbol del motor, pero admite filas a medias y un identificador por fila para React. `toAdvancedTree` descarta lo incompleto y genera el árbol, sin cambios en el motor ni en el IPC. La interfaz limita los grupos a 3 niveles; el motor, a 8.

Cada modo guarda su propio estado, en lugar de compartir un solo árbol. Así no hay que traducir de uno a otro, algo imposible en general: un filtro avanzado no siempre cabe en casillas. Solo se aplica el modo en uso (`activeFilterTree`) y el otro se conserva. Los modos son botones con `aria-pressed`, no pestañas ARIA, porque ese patrón cambia de pestaña con las flechas, y aquí cambiar puede abrir una confirmación.

### Cuadrícula virtualizada

`LibraryGrid` (`src/renderer/features/library/`) usa TanStack Virtual (`useWindowVirtualizer`) y solo dibuja las filas cercanas a lo visible, más tres por cada lado.

- **Por filas:** virtualizar filas conserva la alineación por abajo dentro de cada una. El número de columnas se calcula con el ancho disponible y la misma regla que antes (mínimo 10 rem por tarjeta).
- **Alturas variables:** se estiman con el tamaño de las portadas (`grid-layout.ts`) y se sustituyen por la altura real al medir la fila.
- **Posición al volver:** se guarda el primer elemento visible, no los píxeles, porque la altura de las filas no dibujadas es una estimación. Su fila queda arriba de la ventana, y se recupera también al cambiar el número de columnas. Con el ancho mínimo de la ventana (960 px) y el máximo del contenido (64 rem) hoy siempre caben 5 columnas, así que esto solo se nota si esos límites cambian.
- **Hueco de la barra de scroll:** en la biblioteca siempre está reservado (`scrollbar-gutter: stable`). Si no, una página que casi cabe entra en un bucle sin fin: la barra estrecha las portadas, la página pasa a caber, la barra desaparece, las portadas crecen y la barra vuelve. Lo encontró la CI, con una pantalla más estrecha que la del equipo de desarrollo.
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
