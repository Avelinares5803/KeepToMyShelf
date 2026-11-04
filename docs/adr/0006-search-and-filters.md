# ADR 0006: Búsqueda, filtros y ordenación

- **Estado:** aceptada; implementada la F7-A (motor). La interfaz llega en las entregas siguientes
- **Fecha:** 2026-11-04

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

### Kysely solo genera el SQL

Kysely construye la consulta y `.compile()` devuelve el SQL y sus parámetros; los ejecuta better-sqlite3. La ejecución de Kysely es asíncrona y los servicios son síncronos, así que usa un `DummyDriver` que nunca llega a ejecutar nada. Así no hay que convertir los servicios a asíncronos. El resto de consultas siguen escritas a mano: Kysely se usa donde el SQL es dinámico.

### Sin paginación ni índices nuevos

`items.list` devuelve todos los resultados y la interfaz virtualizará solo el dibujado. Una prueba con 10 000 elementos comprueba los tiempos y que las tablas relacionadas se leen por sus índices. No hizo falta ninguna migración: los índices existentes cubren los `EXISTS`, y un `LIKE '%…%'` recorre la tabla de todos modos.

## Alternativas consideradas

| Alternativa            | Por qué se descartó                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| FTS5                   | No hace falta con estos volúmenes. Se puede adoptar más adelante sin cambiar la API        |
| Paginar por IPC        | Complica el orden, el recuento y el scroll, sin necesidad demostrada                       |
| Un `JOIN` por relación | Duplica filas y hace que dos condiciones sobre el mismo papel no signifiquen «tiene ambos» |
| Filtrar en la interfaz | Obligaría a enviarle todas las relaciones de todos los elementos                           |

## Consecuencias

- Por IPC solo llegan identificadores del registro y valores parametrizados, nunca nombres de columna ni SQL.
- `core/filters` conoce los nombres de algunas columnas de `item`, porque el registro es único. No contiene SQL.
- Si un filtro apunta a un valor eliminado del catálogo, no encuentra nada. La interfaz deberá quitar esa condición.
