# Hoja de ruta de KeepToMyShelf

Este documento reúne **qué se quiere construir, qué está hecho y todo lo acordado para lo que falta**. Es la referencia para planificar cada fase: antes de empezar una, se lee su apartado; al terminar cada entrega, se actualiza.

- La especificación original completa está en [SPECIFICATION.md](SPECIFICATION.md). Sirve para consultar cualquier detalle de los requisitos; si contradice este documento, prevalece este.
- Las decisiones de arquitectura ya implementadas, con su porqué, están en los [ADR](adr/).
- El flujo de ramas y PR está en [GIT-WORKFLOW.md](GIT-WORKFLOW.md).
- La forma de trabajar con Claude Code está en [CLAUDE.md](../CLAUDE.md).

**Última actualización:** 2026-11-04, tras la F7-A.

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

| Fase                      | Contenido                                                                                                                                                      | Estado                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| F0 Fundaciones            | Proyecto base, calidad (ESLint, Prettier, TypeScript estricto, Vitest), CI en Windows y Linux, empaquetado validado con rutas con «á»                          | ✅ Hecha                                       |
| F1 Núcleo                 | Fechas parciales, normalización de texto, nombres provisionales, conexión SQLite, migrador                                                                     | ✅ Hecha                                       |
| F2 Perfiles               | `app.db`, crear, abrir, renombrar y eliminar perfiles, sesión con token                                                                                        | ✅ Hecha                                       |
| F3 Estructura de la UI    | Navegación, barra superior, i18n en tiempo real, tema claro/oscuro, pantalla de modos                                                                          | ✅ Hecha                                       |
| F4 Elementos              | Los tres tipos: alta, ficha, edición, papelera                                                                                                                 | ✅ Hecha                                       |
| F5 Catálogos              | Catálogos, relaciones, fechas de lanzamiento, pantalla «Catálogos», autocompletado, países de origen y listas iniciales                                        | ✅ Hecha (PR #12 a #19 y #23)                  |
| F6 Multimedia             | Portadas, galería, PDF, miniaturas, protocolo seguro                                                                                                           | ✅ Hecha (PR #25 a #28 y la F6-C)              |
| **F7 Búsqueda y filtros** | Buscador, filtros AND/OR, ordenación, cuadrícula virtualizada                                                                                                  | 🚧 **En curso** (F7-A hecha; sigue la F7-B)    |
| F8 Películas y series     | Absorbida casi por completo: la F4 hizo los tres tipos y la F5 sus papeles (dirección, reparto, productoras). Al llegar aquí, revisar si queda algo específico | Pendiente de revisión                          |
| F9 Colecciones            | Colecciones mixtas con portada                                                                                                                                 | Pendiente                                      |
| F10 Personalización       | Fondos predeterminados e importados, desenfoque                                                                                                                | Pendiente                                      |
| F11 Copias de seguridad   | Copia y restauración manual, copia antes de borrar un perfil                                                                                                   | Pendiente (la copia antes de migrar ya existe) |
| F12 Distribución v1.0     | Workflow de release, instalador y portable, documentación final                                                                                                | Pendiente                                      |

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

### 3.5 Multimedia (F6, implementado)

Toda la F6 está implementada; el detalle técnico está en el [ADR 0005](adr/0005-media.md).

**Acordado en la planificación inicial:**

- **Almacenamiento gestionado:** los archivos se copian a la carpeta del perfil. Tu archivo original nunca se modifica.
- **Sin duplicados:** se calcula el SHA-256 de cada archivo y, si ya existe, se reutiliza.
- **Dos carpetas** (acordado el 2026-10-31), para que el usuario las encuentre con facilidad: `media\files\` (los archivos que usan los elementos) y `media\originals\` (los originales guardados con la opción 2). Los duplicados se evitan dentro de cada carpeta. Si los mismos bytes hacen falta en las dos (una imagen guardada sin optimizar que además es el original de otra copia), se hace una copia idéntica en cada una.
- **Ventana al importar una imagen** (portada, galería **y también fondos**, en la F10). Tiene tres opciones:
  1. Guardar el original sin optimizar.
  2. Usar una copia optimizada y guardar el original en una carpeta aparte. La imagen conserva un enlace a su original, para poder «volver a usar el original» más adelante.
  3. Usar solo la copia optimizada, sin guardar el original. Tu archivo en el equipo sigue intacto.

  Tendrá una casilla «Recordar mi elección», y la opción por defecto se podrá cambiar en Ajustes. Si la imagen ya es más pequeña que el límite, la ventana lo indica, porque optimizar no aporta nada.

  **Cuando optimizar no reduce el archivo** (acordado el 2026-10-31): la ventana muestra el tamaño del original y el de la copia optimizada. Si la copia no ocupa menos, pregunta «La imagen no se puede optimizar más. ¿Hacer la copia igualmente?», con tres botones: «No, usar la original», «Sí, hacer la copia» y «Cancelar».

- **Optimizar** significa reducir la imagen al tamaño máximo y recomprimirla en **WebP de alta calidad**:
  - **2000 px** de lado mayor para portadas y galería;
  - **3840 px** para fondos.

  Ambos valores serán ajustables.

- **Tamaños máximos por defecto:** 50 MB por imagen y 200 MB por PDF.

- **Miniaturas:** se generan siempre, sea cual sea la opción. Son WebP en dos tamaños (normal y HiDPI) y viven en una caché que se puede regenerar.
  - Tamaños: **320 y 640 px de lado mayor**. El otro lado se calcula para **conservar la proporción** de la imagen: una portada de GBA queda en 320 × 320 y una de N64 en 320 × 230 aproximadamente. Nunca se deforma una imagen.
- **Formatos:** se validan por contenido, no por extensión. Se admiten JPEG, PNG, WebP, AVIF y GIF.
  - Los GIF animados solo se pueden guardar como original, porque optimizarlos perdería la animación.
  - SVG se rechaza, porque puede contener scripts.
- **Documentos:** solo PDF en la v1. Se guardan tal cual, sin optimizar, con un límite de tamaño configurable, y se abren con el visor del sistema.
- **Para los tres tipos** de elemento.
- **Orden en lugar de etiquetas** (acordado el 2026-10-31; sustituye a los papeles previstos «portada, imagen, arte, manual, guía y documento»):
  - Cada elemento tiene una lista de imágenes (la galería) y otra de documentos, separadas y ordenables con botones ↑/↓ y con el teclado, como el reparto. En el esquema solo se distingue entre imagen y documento.
  - Los documentos no pueden ser portada. Se muestran con el nombre del archivo, que se puede editar.
- **Portada independiente de la galería** (acordado el 2026-11-02, en la F6-B3; sustituye a «la primera imagen de la lista es la portada»):
  - La portada es un campo propio del elemento (`item.cover_media_id`). Añadir, ordenar o quitar imágenes de la galería nunca la cambia, y un elemento puede tener galería sin portada.
  - En el formulario tiene su propia sección, «Portada», encima de «Identificación»: un hueco con «Añadir portada» o, si la hay, «Cambiar portada», «Quitar portada» y «Usar el original». Pasa por la misma ventana de importación que la galería.
  - «Usar como portada», en la galería, hace que esa imagen sea también la portada sin sacarla de la galería. Es el mismo archivo, guardado una sola vez; se borra solo cuando ni la portada ni la galería lo usan.
  - Al migrar, la primera imagen de cada elemento pasó a ser su portada y siguió en la galería.
- **Presentación en la ficha** (acordada el 2026-10-31): una sola sección «Multimedia» con dos bloques, «Imágenes» (miniaturas que se amplían al hacer clic) y «Documentos» (lista que abre el visor del sistema). Un bloque vacío no se muestra. El formulario de edición sigue el mismo esquema.
  - Si hay más de **10 imágenes**, se muestran las 10 primeras y un enlace «Ver todas (N)» que abre la galería completa. El número se revisará en la F6-B al ver el aspecto real.
- **Integridad:**
  - La base de datos manda: primero se borra la fila y luego un barrido elimina los archivos huérfanos.
  - Un archivo que falte (borrado a mano) muestra un aviso discreto, sin que falle nada: «Archivo no encontrado» en la ficha, y solo el título en la biblioteca. Limitación conocida: si se borra con la app abierta, la biblioteca sigue mostrando las portadas que ya había mostrado hasta reiniciar la app, porque Chromium las guarda en memoria.
  - Un elemento en la papelera conserva sus archivos. Al eliminarlo definitivamente, se borran los que nadie más use.
- **Seguridad:** la interfaz no puede leer el disco. Las imágenes se sirven con un protocolo propio (`ktms-media://`) limitado a la carpeta `media` del perfil abierto, nunca con `file://`.
- **En la biblioteca:**
  - Con portada, se muestra la imagen con el título debajo, de forma discreta.
  - Sin portada, solo el título, sin imagen ficticia.
  - Nunca se cargan los originales a máxima resolución en la cuadrícula.

**Entregas (acordadas el 2026-10-31):**

- F6-A: tabla, migración 0004, servicio, miniaturas y protocolo. ✅ Hecha.
- F6-B: imágenes en la interfaz, dividida en dos entregas (acordado el 2026-11-01):
  - **F6-B1**: canales IPC, selector de archivos, ventana de importación, bloque «Imágenes» del formulario (ordenar, «Usar como portada», «Quitar», «Usar el original»), y en Ajustes la opción por defecto y el tamaño máximo de la copia optimizada (2000 px). ✅ Hecha.
  - **F6-B2**: sección «Multimedia» de la ficha, visor ampliado, «Ver todas (N)», portadas en la biblioteca y aviso de archivo perdido. ✅ Hecha.
  - **F6-B3** (añadida el 2026-11-02): portada independiente de la galería, con la migración 0005. ✅ Hecha.
- F6-C: documentos PDF, con el visor del sistema; el visor integrado sigue anotado como mejora futura. ✅ Hecha.

Los canales IPC (elegir archivos, importar, ordenar…) van en la F6-B, junto con la pantalla que los usa. **Para la F6-B:** el selector de archivos debe abrirse en el proceso principal (`dialog.showOpenDialog`), que pasa la ruta elegida a `MediaService.prepareImport`. La interfaz nunca debe enviar rutas del disco por IPC.

**Acordado para la F6-B (2026-11-01):**

- **Las imágenes forman parte del borrador.** Añadir una imagen solo la prepara; ordenar, quitar o cambiar la portada solo modifica el borrador. «Guardar» aplica todo en una sola transacción, junto con los datos del elemento. «Cancelar» o «Descartar cambios» descartan las preparaciones, y el aviso de cambios sin guardar también tiene en cuenta las imágenes.
- **Elección recordada:** si la opción recordada es optimizada y la copia no ocupa menos, se usa el original sin preguntar. «Recordar mi elección» se deshace en Ajustes, con «Al importar imágenes» → «Preguntar siempre». Al marcar la casilla, la ventana de importación indica «Puedes cambiar esta elección en Ajustes». No se avisa en ningún otro sitio.
- **Limpieza de temporales:** las importaciones preparadas se descartan al guardar, al cancelar, al cerrar el perfil (cambiar de perfil o salir de la app) y, tras un cierre inesperado, al volver a abrirlo.
- **Límites ajustables:** el tamaño máximo de la copia optimizada (2000 px) se ajusta en Ajustes desde la F6-B1; el límite de los PDF, desde la F6-C; los 3840 px de los fondos, en la F10. Los 50 MB por imagen son fijos.

**Acordado para la F6-C (2026-11-03):**

- **Abrir un documento** copia el PDF a una carpeta temporal (`%TEMP%\KeepToMyShelf\opened-documents\<carpeta aleatoria>\`) con su nombre visible («Manual de Zelda.pdf») y abre esa copia con el visor del sistema. El archivo guardado nunca se toca, porque algunos visores escriben en el archivo abierto (anotaciones) y su contenido debe seguir coincidiendo con su hash. Las anotaciones hechas en la copia no se guardan en la biblioteca. Las copias se borran al cerrar el perfil y al abrir la app; las que un visor tenga abiertas, la vez siguiente.
- **Nombre del documento:** al añadirlo, el del archivo sin «.pdf» (cualquier otro nombre se respeta tal cual). El archivo guardado y la copia que se abre sí llevan la extensión. Se cambia en el formulario de edición (no en la ficha), con las mismas reglas que los títulos: sin espacios sobrantes, sin caracteres de control y como mucho 200 caracteres. **Un nombre vacío bloquea el guardado.**
- **El protocolo `ktms-media://` no sirve documentos:** responde «no encontrado». Los PDF solo salen de la app por el visor del sistema.
- **Una sola PR** para toda la F6-C.
- **Tamaño máximo de los PDF** en Ajustes: 50, 100, **200** (por defecto), 500 o 1000 MB, con «Aplicar a todos los perfiles». Solo afecta a las importaciones nuevas. **Los PDF no se optimizan** (ver las mejoras anotadas).
- **Ajustes más claros** (2026-11-03, tras probar la F6-C): la opción de 2000 px se llama «Tamaño máximo de las imágenes optimizadas» y lleva una explicación debajo («Las imágenes más grandes se reducen hasta que su lado más largo mide esto. Nunca se amplían.»). El icono de Ajustes es un engranaje con dientes; antes parecía el sol del tema claro.
- **Cada diálogo comprueba lo elegido:** un PDF en el de imágenes, o una imagen en el de documentos, se rechaza al momento con su nombre y el motivo.

**Portadas con proporciones distintas en la cuadrícula** (acordado el 2026-10-31): cada portada conserva su proporción (tarjetas de altura variable). No se deforma, no se recorta y no hay una proporción común: quien quiera uniformidad puede preparar sus imágenes con la misma proporción.

**Acordado para la F6-B2 (2026-11-02):**

- **Cuadrícula de la biblioteca:** tarjetas de ancho fijo (unos 10 rem) **alineadas por abajo, como libros en una estantería**. Los títulos quedan a la misma altura y cada portada conserva su forma.
- **Ficha:** la portada se muestra grande a la izquierda de los datos (encima en ventanas estrechas) y abre el visor. La sección «Multimedia» va al final, antes de «Añadido el», con las imágenes de la galería en su orden (desde la F6-B3, la portada no se repite ahí salvo que también esté en la galería).
- **Visor a pantalla completa** con fondo oscuro, flechas, contador y teclado (←, →, Esc). Muestra el archivo completo, no la miniatura. Desde la F6-B3, la portada se abre sola en el visor, y una imagen de la galería abre la galería.
- **Papelera:** cada fila muestra una miniatura pequeña de la portada, si la tiene, para reconocer lo que se va a eliminar.
- ~~**La portada siempre es la imagen 1**~~: sustituido en la F6-B3 por la portada independiente.

### 3.6 Búsqueda, filtros y ordenación (F7)

El detalle técnico del motor está en el [ADR 0006](adr/0006-search-and-filters.md).

- **Buscador** por título y títulos alternativos: parcial, sin distinguir mayúsculas ni acentos (columnas `title_norm`), y combinable con los filtros. Si algún día no basta, se puede pasar a SQLite FTS5 sin cambiar la API.
- **Los «Sin nombre N» se encuentran al buscarlos** (acordado el 2026-11-04), comparando con el nombre en el idioma actual.
- **Filtros como árbol de expresiones** (grupos AND/OR de condiciones). Hay un **registro de campos**: añadir un filtro nuevo consiste en registrar un descriptor, sin tocar el motor. Ejemplos de la especificación:
  - Género = RPG AND Plataforma = PC.
  - Género = RPG OR Género = Acción.
  - Estado = Terminado AND Etiqueta = Romhack.
- **SQL:** parametrizado, con `EXISTS` para las relaciones de muchos a muchos. Así, «Género = RPG AND Género = Acción» significa que el elemento tiene ambos.
- **Kysely** se adopta en esta fase, solo para generar el SQL dinámico; lo ejecuta better-sqlite3.
- **Filtros disponibles:**
  - Todos los tipos: Estado, Rejugado/Revisionada, Formato, Valoración (≥, ≤ y «sin valorar»), Favorito, Sagas, Géneros, Países de origen, Etiquetas y Música.
  - Videojuegos: Mis plataformas, Plataformas de lanzamiento, Distribuidoras y Desarrolladoras.
  - Películas y series: Productoras, Dirección y Reparto.
  - Más adelante, sin tocar el motor: año de lanzamiento, horas, temporadas.
- **Interfaz: dos pestañas, «Filtros simples» y «Filtros avanzados»** (acordado el 2026-11-04; sustituye a que el panel y el constructor compartieran un solo árbol):
  - Los filtros simples son listas de casillas: OR dentro de un atributo, AND entre atributos.
  - Los avanzados son un constructor de grupos AND/OR anidados.
  - Cada pestaña guarda sus propios filtros y **solo se aplica una**. La otra se ve atenuada y sus filtros se ignoran, pero no se borran.
  - Si la pestaña en uso tiene filtros, cambiar pide confirmación («Si continúas, se usarán los filtros avanzados y se ignorarán los filtros simples. No se borrarán: podrás volver a ellos.»), con el foco en «Cancelar». Si no tiene, se cambia directamente.
  - «Quitar filtros» solo vacía la pestaña en uso.
- **Valores que ofrecen los filtros** (acordado el 2026-11-04; sustituye al selector por tipo, que se queda solo en «Catálogos»): los que usa algún elemento de esa biblioteca, sin contar la papelera.
- **Plataformas** (acordado el 2026-11-04): «Lo tengo en» pasa a llamarse **«Mis plataformas»** («My platforms») y «Publicado en», **«Plataformas de lanzamiento»** («Release platforms»), en los filtros, el formulario y la ficha. El cambio de nombre va en la F7-D.
- **Estado de la biblioteca** (acordado el 2026-11-04): la búsqueda, los filtros, el orden y el scroll se guardan por modo hasta cerrar el perfil.
- **Ordenación:** por título (los «Sin nombre» al final), fecha de alta, valoración, fecha de lanzamiento más temprana y fechas de uso. Lo que no tiene dato va siempre al final, también en orden descendente.
- **Cabecera:** con filtros activos, «(N)» es el número de resultados.
- **Rendimiento:** cuadrícula virtualizada con TanStack Virtual y una prueba con 10 000 elementos. No hacen falta índices nuevos; `items.list` devuelve todos los resultados, sin paginar.

**Entregas (acordadas el 2026-11-04):**

- F7-A: motor (árbol, registro, consulta, búsqueda, ordenación e IPC), sin cambios visibles. ✅ Hecha.
- F7-B: buscador, selector de orden, «(N)», aviso de «sin resultados» y estado por modo.
- F7-C: cuadrícula virtualizada, con la prueba E2E de 10 000 elementos.
- F7-D: filtros simples y nombres nuevos de las plataformas.
- F7-E: filtros avanzados y las dos pestañas.

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
   ├─ media\files\              archivos que usan los elementos     (implementado)
   ├─ media\originals\          originales junto a una copia optimizada (implementado)
   └─ cache\thumbs\             miniaturas regenerables             (implementado)

%TEMP%\KeepToMyShelf\
└─ opened-documents\<id>\       copias de los PDF abiertos en el visor (implementado; se borran solas)
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
- **Portada:** primero era la primera imagen de la lista (F6-B); desde la F6-B3 es un campo propio, independiente de la galería, porque la regla implícita resultaba poco intuitiva.
- **Selector por tipo en los filtros:** previsto en el ADR 0004 y descartado en la F7, porque cada biblioteca es de un solo tipo.

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
- Optimizar PDF escaneados (opcional). Necesita una herramienta externa: sharp no trabaja con PDF, Ghostscript (la que de verdad los reduce) tiene licencia AGPL, y qpdf o pdf-lib apenas reducen. Recomprimir puede degradar escaneos o romper formularios y firmas.
- Un control para agrandar o reducir las portadas de la biblioteca.
- Añadir imágenes y documentos arrastrándolos a la ventana. Necesita `webUtils.getPathForFile` en el preload para obtener la ruta del archivo soltado.
- Exportar e importar bibliotecas (JSON/CSV) y copias programadas.
- Seguimiento por temporada o episodio; varias sesiones de juego o visionado.
- Integración opcional con APIs (IGDB, TMDB) e importación masiva.
- Estadísticas personales.
- Sincronización entre dispositivos.
- Actualizaciones automáticas y firma de código.
- Versiones para Linux y macOS.
- Plugins.
