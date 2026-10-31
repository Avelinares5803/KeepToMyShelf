# Hoja de ruta de KeepToMyShelf

Este documento reúne **qué se quiere construir, qué está hecho y todo lo acordado para lo que falta**. Es la referencia para planificar cada fase: antes de empezar una, se lee su apartado; al terminar cada entrega, se actualiza.

- La especificación original completa está en [SPECIFICATION.md](SPECIFICATION.md). Sirve para consultar cualquier detalle de los requisitos; si contradice este documento, prevalece este.
- Las decisiones de arquitectura ya implementadas, con su porqué, están en los [ADR](adr/).
- El flujo de ramas y PR está en [GIT-WORKFLOW.md](GIT-WORKFLOW.md).
- La forma de trabajar con Claude Code está en [CLAUDE.md](../CLAUDE.md).

**Última actualización:** 2026-10-31, tras cerrar la F5.

---

## 1. Objetivo del producto

Aplicación de escritorio **local, sin servidor y sin conexión obligatoria** para Windows 10 y 11 (sin cerrar la puerta a Linux y macOS) que permite catalogar **videojuegos, películas y series**. Resumen de la especificación original (2026-10-20):

- **Perfiles** independientes, cada uno con su biblioteca, preferencias, valoraciones, etiquetas y colecciones.
- **Tres modos** (Videojuegos, Películas, Series), cada uno con su biblioteca visual de portadas, ficha de detalle y edición.
- **Atributos** opcionales por tipo: títulos alternativos, portada, multimedia, descripción, fechas de lanzamiento por región, plataformas, géneros, sagas, empresas y personas con su papel, valoración, estado, fechas de uso con precisión variable, etiquetas y formato.
- **Catálogos editables** (plataformas, géneros, sagas, empresas, personas, etiquetas…) sin referencias rotas.
- **Búsqueda** por título, **filtros AND/OR** extensibles y **ordenación**.
- **Colecciones** personalizadas.
- **Imágenes y PDF** gestionados por la aplicación, con miniaturas y sin duplicados.
- **Español e inglés** en tiempo real, tema claro/oscuro y **fondos** con desenfoque.
- **Copias de seguridad** y restauración.
- **Instalador** para Windows, CI/CD en GitHub y documentación.
- **Prioridades transversales:** código limpio y modular, pruebas desde el principio, integridad de los datos, buen rendimiento con bibliotecas grandes e interfaz moderna y accesible.

---

## 2. Estado de las fases

| Fase                    | Contenido                                                                                                                                                      | Estado                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| F0 Fundaciones          | Proyecto base, calidad (ESLint, Prettier, TypeScript estricto, Vitest), CI en Windows y Linux, empaquetado validado con rutas con «á»                          | ✅ Hecha                                       |
| F1 Núcleo               | Fechas parciales, normalización de texto, nombres provisionales, conexión SQLite, migrador                                                                     | ✅ Hecha                                       |
| F2 Perfiles             | `app.db`, crear, abrir, renombrar y eliminar perfiles, sesión con token                                                                                        | ✅ Hecha                                       |
| F3 Estructura de la UI  | Navegación, barra superior, i18n en tiempo real, tema claro/oscuro, pantalla de modos                                                                          | ✅ Hecha                                       |
| F4 Elementos            | Los tres tipos: alta, ficha, edición, papelera                                                                                                                 | ✅ Hecha                                       |
| F5 Catálogos            | Catálogos, relaciones, fechas de lanzamiento, pantalla «Catálogos», autocompletado, países de origen y listas iniciales                                        | ✅ Hecha (PR #12 a #19 y #23)                  |
| **F6 Multimedia**       | Portadas, galería, PDF, miniaturas, protocolo seguro                                                                                                           | ⏳ **Siguiente**                               |
| F7 Búsqueda y filtros   | Buscador, filtros AND/OR, ordenación, cuadrícula virtualizada                                                                                                  | Pendiente                                      |
| F8 Películas y series   | Absorbida casi por completo: la F4 hizo los tres tipos y la F5 sus papeles (dirección, reparto, productoras). Al llegar aquí, revisar si queda algo específico | Pendiente de revisión                          |
| F9 Colecciones          | Colecciones mixtas con portada                                                                                                                                 | Pendiente                                      |
| F10 Personalización     | Fondos predeterminados e importados, desenfoque                                                                                                                | Pendiente                                      |
| F11 Copias de seguridad | Copia y restauración manual, copia antes de borrar un perfil                                                                                                   | Pendiente (la copia antes de migrar ya existe) |
| F12 Distribución v1.0   | Workflow de release, instalador y portable, documentación final                                                                                                | Pendiente                                      |

Cada fase se divide en entregas pequeñas (F5-A, F5-B…), cada una con su rama y su PR.

---

## 3. Decisiones acordadas

### 3.1 Base técnica (implementado)

- Electron + TypeScript + React + SQLite (better-sqlite3) + sharp + electron-builder. Ver [ADR 0001](adr/0001-stack.md).
- Una base de datos por perfil (`library.db`) más `app.db` para perfiles y preferencias. Ver [ADR 0003](adr/0003-profiles.md).
- Migraciones solo hacia delante, con copia de seguridad previa y claves foráneas desactivadas durante la migración. Ver [ADR 0002](adr/0002-database-migrations.md).
- Seguridad de Electron: `contextIsolation`, `sandbox`, sin `nodeIntegration`, CSP estricta y preload mínimo. Todo lo que llega por IPC se valida con zod.
- Repositorio público con licencia MIT. `main` protegida (PR y CI obligatorias), Dependabot semanal con 7 días de espera.

### 3.2 Perfiles y preferencias

**Implementado:**

- Nombre de 1 a 40 caracteres. Los repetidos (sin distinguir mayúsculas ni acentos) reciben el sufijo libre más bajo: «Carlos (1)».
- Se muestran solo por su nombre, sin avatar.
- Eliminar un perfil pide confirmación con botones Sí/No, resaltando su nombre. El perfil abierto no se puede eliminar.
- El idioma y el tema tienen un valor global que cada perfil puede sobrescribir. «Aplicar a todos los perfiles» está disponible.
- El idioma se elige al crear el perfil.

**Pendiente:**

- Elegir también el fondo al crear un perfil (F10).
- Copia de seguridad automática antes de eliminar un perfil (F11).

### 3.3 Elementos (implementado en la F4)

- **Identidad:** id interno y UUID. Los títulos duplicados están permitidos.
- **Sin título:** se muestra «Sin nombre N» o «Untitled N» según el idioma. N es el número libre más bajo de ese tipo. Los elementos en la papelera conservan su número. Un «Untitled 4» escrito a mano es un título real y no se traduce.
- **Estados:**
  - Videojuegos: Por empezar, En curso, Terminado, Abandonado.
  - Películas y series: los mismos, en femenino.
  - Además, una casilla independiente: «Rejugado» o «Revisionada».
- **Formato:** Físico, Digital o Ambos. Se guarda como dos casillas, así que filtrar por «Físico» incluye «Ambos».
- **Valoración:** 5 estrellas con medias estrellas, o «sin valorar». Se guarda como un entero de 0 a 10.
- **Fechas de uso** (de juego o de visionado):
  - Inicio y fin con precisión de año, mes o día, o «Indeterminada».
  - El fin no puede ser seguro anterior al inicio: las fechas parciales se comparan como rangos.
  - Si son idénticas y tienen la misma precisión, se muestra una sola.
  - Formato de visualización: en español 14/03/2021, 03/2021 o 2021; en inglés «14 Mar 2021».
- **Otros campos:**
  - Favorito y notas.
  - Fecha de alta automática.
  - Horas jugadas (HH:MM), solo en videojuegos.
  - Temporadas y capítulos, solo en series, como números generales.
- **Edición:**
  - Botones explícitos Guardar y Cancelar; después de guardar se vuelve a la ficha.
  - Si se sale con cambios sin guardar, se pregunta: Seguir editando (con el foco), Descartar o Guardar. También al cerrar la ventana.
- **Ficha:** los campos vacíos no se muestran. Orden: Identificación → Mi seguimiento → Ficha → Etiquetas → Añadido el. Ver [ADR 0004](adr/0004-catalogs.md).
- **Eliminar:**
  - Pide confirmación: «¿Seguro que quieres eliminar X? Se enviará a la papelera.»
  - La papelera tiene un selector Videojuegos/Películas/Series/Todo, que empieza en el modo de origen.
  - «Vaciar papelera» vacía solo lo que se muestra.
  - Un elemento en la papelera desaparece de bibliotecas, búsquedas y colecciones, pero conserva sus relaciones y sus pertenencias.
- **Cabecera de la biblioteca:** «Videojuegos (N)». No hay contadores en las tarjetas de modo.

### 3.4 Catálogos (implementado en la F5)

Todo está en el [ADR 0004](adr/0004-catalogs.md). Resumen:

- **Nueve catálogos:** plataformas, géneros de videojuegos, géneros de películas y series, sagas, empresas, personas, etiquetas, regiones y países.
- **Nombres:** se distinguen por su texto exacto. La búsqueda ignora mayúsculas y tildes y busca también en los alias.
- **Listas iniciales:** se copian una vez por perfil, en su idioma. Los valores que se añadan después a una lista ya existente no llegan a los perfiles que ya la recibieron; un catálogo nuevo necesita su propia marca de carga.
- **Criterio para los géneros iniciales:** géneros amplios, sin subgéneros ni ambientaciones (Medieval, Cyberpunk, Cocina…), que se cubren con etiquetas. Los alias de la lista inicial no deben ser redundantes; una prueba lo impone.

### 3.5 Multimedia (F6, siguiente)

**Acordado en la planificación inicial:**

- **Almacenamiento gestionado:** los archivos se copian a la carpeta del perfil. Tu archivo original nunca se modifica.
- **Sin duplicados:** se calcula el SHA-256 de cada archivo y, si ya existe, se reutiliza.
- **Ventana al importar una imagen** (portada, galería **y también fondos**, en la F10). Tiene tres opciones:
  1. Guardar el original sin optimizar.
  2. Usar una copia optimizada y guardar el original en una carpeta aparte. La imagen conserva un enlace a su original, para poder «volver a usar el original» más adelante.
  3. Usar solo la copia optimizada, sin guardar el original. Tu archivo en el equipo sigue intacto.

  Tendrá una casilla «Recordar mi elección», y la opción por defecto se podrá cambiar en Ajustes. Si la imagen ya es más pequeña que el límite, la ventana lo indica, porque optimizar no aporta nada.

- **Optimizar** significa reducir la imagen al tamaño máximo y recomprimirla:
  - **2000 px** de lado mayor para portadas y galería;
  - **3840 px** para fondos.

  Ambos valores serán ajustables.

- **Miniaturas:** se generan siempre, sea cual sea la opción. Son WebP en dos tamaños (normal y HiDPI) y viven en una caché que se puede regenerar.
- **Formatos:** se validan por contenido, no por extensión. Se admiten JPEG, PNG, WebP, AVIF y GIF.
  - Los GIF animados solo se pueden guardar como original, porque optimizarlos perdería la animación.
  - SVG se rechaza, porque puede contener scripts.
- **Documentos:** solo PDF en la v1. Se guardan tal cual, sin optimizar, con un límite de tamaño configurable, y se abren con el visor del sistema.
- **Para los tres tipos** de elemento. Papeles previstos: portada, imagen, arte, manual, guía y documento.
- **Integridad:**
  - La base de datos manda: primero se borra la fila y luego un barrido elimina los archivos huérfanos.
  - Un archivo que falte (borrado a mano) muestra un aviso discreto, sin que falle nada.
  - Un elemento en la papelera conserva sus archivos. Al eliminarlo definitivamente, se borran los que nadie más use.
- **Seguridad:** la interfaz no puede leer el disco. Las imágenes se sirven con un protocolo propio (`ktms-media://`) limitado a la carpeta `media` del perfil abierto, nunca con `file://`.
- **En la biblioteca:**
  - Con portada, se muestra la imagen con el título debajo, de forma discreta.
  - Sin portada, solo el título, sin imagen ficticia.
  - Nunca se cargan los originales a máxima resolución en la cuadrícula.

**Propuesta del 2026-10-30, pendiente de respuesta:**

- División en tres entregas:
  - F6-A: tabla, migración, servicio, miniaturas y protocolo.
  - F6-B: imágenes en el formulario, la ficha y la biblioteca, y la preferencia en Ajustes.
  - F6-C: documentos PDF.
- La portada por defecto es la primera imagen añadida. El resto forman la galería, ordenable.

**Decisiones abiertas, a confirmar al planificar la F6:**

1. Formato de la copia optimizada. Se propuso WebP de alta calidad. En esa propuesta se habló de 2560 px por error: **lo acordado es 2000 px y 3840 px**.
2. Tamaños máximos. Se propusieron 50 MB por imagen y 200 MB por PDF.
3. ¿Solo «portada + galería», o una etiqueta opcional por imagen (Contraportada, Disco/Cartucho, Captura, Arte conceptual, Otro)?
4. PDF con el visor del sistema (lo acordado en la planificación) o integrado (mucho más trabajo; anotado como mejora futura).
5. Permiso para el cambio de esquema (migración 0004).

### 3.6 Búsqueda, filtros y ordenación (F7)

- **Buscador** por título y títulos alternativos: parcial, sin distinguir mayúsculas ni acentos (columnas `title_norm`), y combinable con los filtros. Si algún día no basta, se puede pasar a SQLite FTS5 sin cambiar la API.
- **Filtros como árbol de expresiones** (grupos AND/OR de condiciones). Hay un **registro de campos**: añadir un filtro nuevo consiste en registrar un descriptor, sin tocar el motor. Ejemplos de la especificación:
  - Género = RPG AND Plataforma = PC.
  - Género = RPG OR Género = Acción.
  - Estado = Terminado AND Etiqueta = Romhack.
- **SQL:** parametrizado, con `EXISTS` para las relaciones de muchos a muchos. Así, «Género = RPG AND Género = Acción» significa que el elemento tiene ambos.
- **Kysely** se adopta en esta fase, para construir el SQL dinámico.
- **Interfaz:**
  - Primero un panel de facetas (OR dentro de un atributo, AND entre atributos).
  - Después un constructor avanzado de grupos.
  - Los dos generan el mismo árbol.
- **Catálogos compartidos en los filtros** (etiquetas, sagas, empresas, personas, países): un selector por tipo, que empieza en el modo actual.
- **Ordenación:** por título (los «Sin nombre» al final), fecha de alta, valoración, fecha de lanzamiento más temprana y fechas de uso (las indeterminadas al final).
- **Cabecera:** con filtros activos, «(N)» es el número de resultados.
- **Rendimiento:** cuadrícula virtualizada (se valorará TanStack Virtual), índices, y una prueba con 10 000 elementos.

### 3.7 Colecciones (F9)

- **Mixtas:** pueden contener videojuegos, películas y series, y se filtran por tipo.
- **Contenido:** nombre, portada opcional y modificable, y elementos añadidos a mano.
- **Integridad:**
  - Las colecciones guardan referencias, nunca copias de los elementos.
  - Un elemento en la papelera desaparece de sus colecciones, pero vuelve al restaurarlo.
  - Borrar una colección pide confirmación y nunca borra elementos.
- Se propuso que las colecciones sean una cuarta opción en la pantalla de modos. Hay que confirmarlo en la F9.

### 3.8 Personalización (F10)

- **Fondos:** predeterminados e importados. Los importados van a una **galería común a todos los perfiles** (`backgrounds/`) y pasan por la misma ventana de importación.
- **Desenfoque ajustable.**
- **Preferencias de apariencia** (idioma, tema, fondo y desenfoque) en `app.db`:
  - Un valor global que cada perfil puede cambiar.
  - «Aplicar a todos los perfiles», como operación atómica.
  - El fondo y el idioma se eligen al crear el perfil.
- **Selector de perfiles:** muestra el fondo de cada perfil.
- **Fondo borrado:** los perfiles que lo usaban vuelven al predeterminado.
- **Controles:** discretos, sin saturar la interfaz.

### 3.9 Copias de seguridad (F11)

- **Ya existe:** la copia automática antes de cada migración (`VACUUM INTO`, en `backups/` de cada base).
- **Pendiente:**
  - Copia y restauración manual en un `.zip` con la instantánea de la base de datos y los archivos de `media`; las miniaturas se regeneran.
  - Antes de restaurar: validar el archivo, `integrity_check`, cerrar la sesión, sustituir los datos y reabrir.
  - Copia automática antes de eliminar un perfil.
- Las copias deben incluir la carpeta `media` (F6).

### 3.10 Distribución (F12)

- **Formato:** instalador NSIS por usuario (sin permisos de administrador) como principal, y versión portable como opción.
- **`release.yml`:** al crear una etiqueta `v*`, genera el instalador y el portable con sus checksums SHA-256, hace una prueba de humo del artefacto y crea un **release en borrador** que el responsable publica.
- **Versiones:** SemVer `0.x` hasta la 1.0, con un registro de cambios (manual o con release-please).
- **Sin firma de código:** se documenta el aviso de SmartScreen. Icono propio de la aplicación.
- **Actualizaciones automáticas:** opcionales; se decidirán en la F12.
- **Documentación por crear:**
  - `docs/ARCHITECTURE.md`
  - `docs/DEVELOPMENT.md`
  - `docs/TESTING.md`
  - `docs/RELEASING.md`
  - `CHANGELOG.md`

---

## 4. Disposición de los datos en disco

```
%APPDATA%\KeepToMyShelf\
├─ app.db                       perfiles y preferencias            (implementado)
├─ backgrounds\                 fondos importados, comunes          (F10)
└─ profiles\<uuid>\
   ├─ library.db                biblioteca del perfil               (implementado)
   ├─ backups\                  copias antes de migrar              (implementado)
   ├─ media\                    archivos importados                 (F6)
   └─ cache\                    miniaturas regenerables             (F6)
```

Las pruebas automáticas usan siempre una carpeta temporal (`KTMS_USER_DATA_DIR`). Los datos reales del usuario nunca se tocan.

---

## 5. Diferencias con el plan inicial

Cambios ya decididos respecto a la planificación del 2026-10-20, para no volver a proponer lo descartado:

- **Catálogos:** las tablas `term`, `company`, `person` y `franchise` se unificaron en `catalog_entry` + `item_entry` con papeles ([ADR 0004](adr/0004-catalogs.md)).
- **Números de «Sin nombre»:** se reutiliza el número libre más bajo, en lugar de un contador que nunca baja.
- **Papelera:** incluida en la v1; al principio estaba prevista como mejora futura.
- **Librerías de la interfaz:** no se usan react-hook-form, TanStack Query ni Radix UI. El estado de los formularios es propio, se usa un hook `useLoad` y los diálogos son `<dialog>` nativos. Kysely llega en la F7.
- **Países de origen:** atributo añadido en la F5, que no estaba en la especificación.

---

## 6. Mejoras anotadas (fuera del alcance actual)

**Para después de la v1.0 o cuando encaje:**

- **Anime** como cuarto tipo (series, películas, ONA, OVA). Requiere una migración que rehaga `item`.
- Fusionar valores duplicados de los catálogos: opcional y con sugerencias.
- Copiar catálogos de otro perfil.
- Errores por campo en los formularios: todos a la vez, con el campo resaltado.
- Ejecutar las E2E también en Linux (con xvfb) y medir la cobertura (objetivos: `core/` ≥ 90 %, `application/` e `infrastructure/` ≥ 80 %).
- Agrupar las plataformas por fabricante en pantalla (necesita un campo nuevo).
- Visor de PDF integrado (pdf.js).
- Exportar e importar bibliotecas (JSON/CSV) y copias programadas.
- Seguimiento por temporada o episodio; varias sesiones de juego o visionado.
- Integración opcional con APIs (IGDB, TMDB) e importación masiva.
- Estadísticas personales.
- Sincronización entre dispositivos.
- Actualizaciones automáticas y firma de código.
- Versiones para Linux y macOS.
- Plugins.
