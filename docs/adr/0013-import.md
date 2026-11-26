# ADR 0013: Importar la biblioteca

- **Estado:** aceptada; implementada en la v1.3-C (JSON) y ampliada en la v1.3-D (CSV).
- **Fecha:** 2026-11-26

## Contexto

La v1.3-B exporta la biblioteca a un JSON fiel (ver el [ADR 0012](0012-export.md)). Hace falta traerlo a un perfil, el mismo u otro, sin poner en peligro lo que ya tiene: la importación puede repetirse con el mismo archivo, o con uno editado a mano.

## Decisión

### Solo añade

- **Elementos:** si su UUID ya existe en el perfil (también en la papelera), se omiten. Nunca se modifica ni se recupera de la papelera un elemento que existe.
- **Valores de catálogo:** se comparan por catálogo y nombre exacto, como al copiar catálogos de otro perfil ([ADR 0004](0004-catalogs.md#copiar-de-otro-perfil-v12-c)). Los que existen no cambian (ni sus alias ni su ámbito); los nuevos entran con los suyos. También entran los no usados.
- **Colecciones:** se comparan por UUID. Las nuevas se crean; a las nuevas y a las existentes **solo se les añaden** elementos, con su fecha de adición. Solo cuentan los elementos que existan tras importar; los demás se ignoran.

### Lo que se conserva y lo que se ajusta

- **Fechas:** cada elemento conserva su fecha de alta y de modificación, y los de la papelera siguen en ella (con su `deletedAt`). La confirmación avisa de cuántos van a la papelera.
- **Número de «Sin nombre»:** se conserva si está libre en ese tipo; si no, recibe el libre más bajo. Primero se reservan los que se conservan, para que uno reasignado no ocupe el de otro.
- **Nombre de colección ocupado** (sin distinguir mayúsculas ni tildes, como en la app): se le añade el sufijo libre más bajo, «(1)», «(2)»…, acortando el nombre si hace falta para que quepa en 100 caracteres.
- **Ámbito de un género:** si un género del perfil limitado a películas lo usa una serie importada (o al revés), pasa a «Películas y series», como al fusionar. Es el único cambio sobre datos existentes, y la confirmación lo avisa. Si el género es nuevo, entra ya sin límite.
- **Un valor que un elemento usa pero el archivo no lista** (editado a mano) se crea sin alias.

### Validación

- **El archivo:** `format` y `formatVersion` primero (una versión más nueva da `import.too_new`, no «archivo no válido»), y después la forma completa con zod (`application/library-import-file.ts`). Se acepta un BOM inicial. Límite de 100 MB, porque se lee entero (10 000 elementos ocupan unos pocos MB).
- **Cada elemento que se va a añadir** pasa por `checkItemDraft`, las mismas reglas que el formulario. **Todo o nada:** el primero que no las cumple impide la importación, y la interfaz dice su posición, su título y el motivo. Los elementos que se omiten no se comprueban.
- **Un archivo que se contradice** (un UUID repetido, un nombre de valor o de colección no válido, un ámbito fuera de los géneros de películas y series) es `import.invalid_file`.

### Flujo

1. **Vista previa:** el proceso principal abre «Abrir», lee y valida el archivo y calcula qué añadiría (`core/import/library-import.ts`, puro). Devuelve un identificador que representa el archivo, como la restauración ([ADR 0009](0009-backups.md)); la interfaz nunca ve la ruta. Si no hay nada nuevo, la interfaz lo dice sin pedir confirmación.
2. **Confirmación**, con el foco en «Cancelar».
3. **Copia automática `before-import`**, con el `BackupLock` (cuenta para las 10 automáticas y cancela la copia programada en curso). Si falla, no se importa nada (`import.safety_backup_failed`).
4. **Importación en una sola transacción.** Lo que se añade se vuelve a decidir dentro de ella, porque el perfil pudo cambiar desde la vista previa.

- **Los elementos se escriben con el mismo código que el formulario** (`infrastructure/db/item-writer.ts`, extraído de `ItemService`), con su fecha de modificación como marca de tiempo. Sus sentencias SQL se compilan una vez por conexión: importar 10 000 elementos tarda alrededor de 1 s, copia incluida.
- **La pantalla abierta se vuelve a cargar** al terminar (se monta de nuevo), sin cambiar de pantalla. Si el editor tiene cambios sin guardar, se pregunta antes, como al restaurar.

### CSV (v1.3-D)

Un CSV con las columnas de la exportación ([ADR 0012](0012-export.md#csv)) añade elementos de un tipo, que el usuario elige antes de abrir el archivo. Cada fila se convierte en un elemento de exportación, con UUID nuevo, y se añade con `planLibraryImport`: los valores de catálogo, los géneros, los números de «Sin nombre» y la escritura siguen las reglas de arriba.

- **Lectura** (`core/import/csv-parse.ts`): RFC 4180, con o sin BOM. El separador es el que aparece en la cabecera, que no contiene `;` ni `,`; si no aparece ninguno, el archivo tiene una sola columna. Un archivo que no es UTF-8 válido se lee como Windows-1252, porque así guarda Excel el «CSV» en español. Una comilla sin cerrar es `import.csv_unclosed_quote`.
- **Cabeceras:** en los dos idiomas, en cualquier orden y sin distinguir mayúsculas ni tildes. Solo «Título» es obligatoria; las demás pueden faltar. Una cabecera desconocida o repetida es un error. Si todas son de otro tipo, se dice cuál (`import.csv_kind_*`).
- **Valores** (`core/import/csv-import.ts`): los fijos (estado con los dos géneros, Sí/No y formato) se reconocen en los dos idiomas, sin mayúsculas ni tildes. La valoración, con coma o con punto. Las horas, como `HH:MM`, `HH:MM:00` (Excel puede añadirlo) u horas enteras. Las fechas, solo ISO, o «Indeterminada»/«Unknown». A cada celda se le quita el apóstrofo que puso la exportación contra las fórmulas.
- **«Añadido el»** da la fecha de alta, a las 00:00 en hora local; vacía, la de la importación. La fecha de modificación es la de la importación.
- **Colecciones:** se buscan por nombre como en la app (sin mayúsculas ni tildes); las que no existen se crean.
- **Todos los errores, por fila y columna**, con las reglas de cada celda y las del formulario. Si hay alguno, no se importa nada; la interfaz muestra los 100 primeros.
- **Duplicados:** una fila cuyo título coincide con el de un elemento del mismo tipo (también en la papelera), sin distinguir mayúsculas ni tildes, se muestra con los dos títulos y su casilla, marcada para omitirla. Como pueden ser elementos distintos («Hipo» e «Hipó»), cada fila se decide por separado. Con la elección, el proceso principal vuelve a calcular lo que se añadirá antes de la confirmación.

## Consecuencias

- Importar dos veces el mismo archivo no duplica nada.
- Un elemento editado en el perfil no recibe los cambios del archivo, aunque sean más recientes: importar no sincroniza.
- Un elemento borrado definitivamente del perfil vuelve si se importa un archivo anterior que lo tenía.
- Lo que el archivo no tiene (imágenes, documentos, portadas de colecciones, preferencias) no se importa; para eso está la copia de seguridad.
- Un CSV no tiene UUID: importarlo dos veces duplica los elementos, salvo que se omitan al avisar de los duplicados. Las fechas que una hoja de cálculo convierte (`2021-03` → «mar-21») dan error en su fila.
