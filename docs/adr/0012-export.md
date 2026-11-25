# ADR 0012: Exportar la biblioteca

- **Estado:** aceptada; implementada en la v1.3-B.
- **Fecha:** 2026-11-25

## Contexto

Las copias de seguridad (ver el [ADR 0009](0009-backups.md)) guardan un perfil entero, pero solo las entiende la app. Hace falta sacar los datos en formatos abiertos: uno fiel, que la v1.3-C pueda importar, y otro para hojas de cálculo, que la v1.3-D también leerá.

## Decisión

### Dos formatos

- **JSON:** la biblioteca completa, con la papelera.
- **CSV:** los elementos de un tipo, sin la papelera.

Ninguno lleva imágenes, documentos ni preferencias: para eso está la copia de seguridad, y la interfaz lo dice.

### JSON, versión 1

`format: "keeptomyshelf-library"`, `formatVersion: 1`, `appVersion`, `exportedAt` y `profile.name`, además de `catalogs`, `items` y `collections`. Los tipos están en `shared/exports.ts`. UTF-8 sin BOM.

- **Sin ids internos**, que no significan nada en otro perfil. Los elementos y las colecciones se identifican por su UUID, y los valores de catálogo, por su catálogo y su nombre exacto, que es único. El catálogo de una relación se deduce del tipo y del papel (`catalogForRole`); el de un lanzamiento es siempre `region`.
- **Todos los valores de catálogo**, también los no usados, con sus alias y su ámbito.
- **Los elementos de la papelera llevan `deletedAt`.** Quien comparta el archivo comparte también la papelera; la interfaz lo avisa.
- **El número de «Sin nombre» se incluye**, pero al importar puede estar ocupado.
- **Las fechas** son las de la base de datos: `2021`, `2021-03`, `2021-03-14` y, en las de uso, `unknown`. La valoración va de 1 a 10 (medias estrellas).
- `formatVersion` solo sube si una app anterior no podría leer el archivo.

### CSV

- **Columnas fijas por tipo**, en `core/export/csv-columns.ts`, con sus etiquetas y sus valores en los dos idiomas; se usa el del perfil. Una prueba comprueba que coinciden con los textos de la interfaz.
- **UTF-8 con BOM y CRLF**, para que Excel muestre bien las tildes.
- **Separador elegible**, `;` o `,`; por defecto, el habitual del idioma. Excel usa la configuración regional de Windows, que la app no puede saber con seguridad. La línea `sep=;` se descartó porque puede hacer que Excel ignore el UTF-8.
- **La valoración, en estrellas**, con coma decimal si el separador es `;` y con punto si es `,`. En un Excel español, «4.5» puede convertirse en una fecha.
- **Varios valores en una celda:** `|`, con `\|` y `\\` como escapes. Los lanzamientos son `Región: fecha`; como una fecha no contiene `: `, el último separa la región.
- **Un elemento sin título** deja la celda vacía: «Sin nombre 3» se importaría como un título real.
- **Fórmulas:** si una celda empieza por `=`, `+`, `-`, `@` (también en ancho completo), tabulador o retorno de carro, se le antepone `'`. También si empieza por apóstrofos seguidos de uno de ellos: así, quitar un apóstrofo devuelve siempre el original.

### Lectura y escritura

- **Una consulta por tabla**, en una sola transacción, y sin pasar por `ItemService`, que haría varias por elemento. Con 10 000 elementos, exportar entero (interfaz incluida) tarda menos de 0,2 s.
- **Se escribe en `<destino>.<uuid>.partial` y se renombra.** Si falla, se borra y llega `export.write_failed`; el archivo anterior queda intacto.
- El proceso principal abre «Guardar como». La interfaz solo recibe el nombre del archivo y el número de elementos, nunca la ruta.
- **No usa el `BackupLock`:** la lectura es síncrona y no toca los archivos del perfil.

## Consecuencias

- Cambiar el JSON de forma incompatible, o las columnas del CSV, afecta a la importación de archivos ya guardados.
- **Una hoja de cálculo puede alterar el CSV** al guardarlo: convierte fechas como `2021-03` y limita cada celda a 32 767 caracteres (las notas admiten 50 000). El formato fiel es el JSON.
- **La protección contra fórmulas supone que el archivo se abre con su separador.** Con el otro, un texto podría partirse y una parte quedar al principio de una celda.
- Un cierre inesperado en plena escritura puede dejar un `.partial` en la carpeta elegida: la app no la conoce al arrancar, así que no lo limpia.
