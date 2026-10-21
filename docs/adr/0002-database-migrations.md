# ADR 0002: Esquema de base de datos y migraciones

- **Estado:** aceptada
- **Fecha:** 2026-10-21

## Contexto

Cada perfil tiene su propia base de datos SQLite (`library.db`). El esquema evolucionará fase a fase y, una vez publicada la app, los usuarios tendrán datos reales que no se pueden perder al actualizar.

## Decisión

### Migraciones

- Cada cambio de esquema es un archivo SQL numerado en `src/main/infrastructure/db/migrations/<base>/` (`0001_items.sql`, `0002_...`), registrado en orden en el `index.ts` de esa carpeta.
- La versión actual se guarda en la propia base de datos (`PRAGMA user_version`).
- Al abrir una base, se aplican en orden las migraciones pendientes. **Cada migración se ejecuta en una transacción junto con el cambio de versión**: o se aplica entera o no se aplica nada.
- Los archivos SQL **no** deben contener `BEGIN`/`COMMIT`.
- Solo hacia delante: no hay migraciones «hacia atrás». Si la base procede de una versión más nueva de la app, se rechaza (`DatabaseTooNewError`) para no dañarla.
- **Una migración publicada nunca se modifica ni se reordena.** Cualquier corrección se hace con una migración nueva.
- Cada fase añade su propia migración con las tablas que necesita, en lugar de crear todo el esquema de una vez.

### Copias de seguridad

- Antes de migrar una base que ya tiene datos (versión > 0), se crea una copia con `VACUUM INTO` en `backups/<nombre>-v<versión>-<fecha>.db`, junto a la base de datos.
- Si la copia falla, no se migra.
- La política de retención (cuántas copias conservar) se definirá en la fase de copias de seguridad.

### Integridad

- Todas las conexiones activan `foreign_keys`, `journal_mode = WAL`, `synchronous = NORMAL` y `busy_timeout = 5000`.
- Las tablas son `STRICT`: SQLite rechaza valores del tipo equivocado (por ejemplo, texto en una columna numérica).
- Las reglas básicas se duplican como `CHECK` en la base de datos (defensa en profundidad), aunque la validación principal está en `src/core`.

### Esquema 0001

- `item`: tabla común para videojuegos, películas y series.
  - Título real **o** número provisional, nunca ambos.
  - Valoración de 1 (media estrella) a 10 (cinco estrellas); `NULL` significa sin valorar.
  - Fechas de uso como fecha parcial ISO o `'unknown'`.
  - Horas jugadas solo en videojuegos.
  - `deleted_at` para la papelera.
- `series_details`: temporadas y capítulos.
- `item_alt_title`: títulos alternativos.
- Los números provisionales son únicos por tipo, incluidos los elementos en la papelera.

## Consecuencias

- Las migraciones son transparentes y fáciles de revisar en las pull requests.
- Los cambios que requieran reconstruir una tabla (SQLite no permite todos los `ALTER TABLE`) necesitarán desactivar temporalmente las claves foráneas. El ejecutor se ampliará cuando haga falta el primero.
