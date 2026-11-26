# Hoja de ruta de KeepToMyShelf

Este documento reúne **qué se quiere construir, qué está hecho y todo lo acordado para lo que falta**. Es la referencia para planificar cada fase: antes de empezar una, se lee su apartado; al terminar cada entrega, se actualiza.

- La especificación original completa está en [SPECIFICATION.md](SPECIFICATION.md). Sirve para consultar cualquier detalle de los requisitos; si contradice este documento, prevalece este.
- Las decisiones de arquitectura ya implementadas, con su porqué, están en los [ADR](adr/).
- El flujo de ramas y PR está en [GIT-WORKFLOW.es.md](GIT-WORKFLOW.es.md).
- La arquitectura, el desarrollo y las pruebas se explican en [ARCHITECTURE.es.md](ARCHITECTURE.es.md), [DEVELOPMENT.es.md](DEVELOPMENT.es.md) y [TESTING.es.md](TESTING.es.md).
- La forma de trabajar con Claude Code está en [CLAUDE.md](../CLAUDE.md).

**Última actualización:** 2026-11-26, con la v1.3-C (apartado 3.13).

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

| Fase                         | Contenido                                                                                                                                        | Estado                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| F0 Fundaciones               | Proyecto base, calidad (ESLint, Prettier, TypeScript estricto, Vitest), CI en Windows y Linux, empaquetado validado con rutas con «á»            | ✅ Hecha                            |
| F1 Núcleo                    | Fechas parciales, normalización de texto, nombres provisionales, conexión SQLite, migrador                                                       | ✅ Hecha                            |
| F2 Perfiles                  | `app.db`, crear, abrir, renombrar y eliminar perfiles, sesión con token                                                                          | ✅ Hecha                            |
| F3 Estructura de la UI       | Navegación, barra superior, i18n en tiempo real, tema claro/oscuro, pantalla de modos                                                            | ✅ Hecha                            |
| F4 Elementos                 | Los tres tipos: alta, ficha, edición, papelera                                                                                                   | ✅ Hecha                            |
| F5 Catálogos                 | Catálogos, relaciones, fechas de lanzamiento, pantalla «Catálogos», autocompletado, países de origen y listas iniciales                          | ✅ Hecha (PR #12 a #19 y #23)       |
| F6 Multimedia                | Portadas, galería, PDF, miniaturas, protocolo seguro                                                                                             | ✅ Hecha (PR #25 a #28 y la F6-C)   |
| F7 Búsqueda y filtros        | Buscador, filtros AND/OR, ordenación, cuadrícula virtualizada                                                                                    | ✅ Hecha (PR #33 a #36 y la F7-E)   |
| F8 Películas y series        | Absorbida por completo: la F4 hizo los tres tipos y la F5 sus papeles (dirección, reparto, productoras). Revisada el 2026-11-07: no quedaba nada | ✅ Hecha (sin entregas propias)     |
| F9 Colecciones               | Colecciones mixtas con portada                                                                                                                   | ✅ Hecha (PR #38, #39 y la F9-C)    |
| F10 Personalización          | Fondos predeterminados e importados, desenfoque y atenuación                                                                                     | ✅ Hecha (PR #45 a #48 y la F10-C2) |
| F11 Copias de seguridad      | Copia y restauración manual, copia antes de borrar un perfil                                                                                     | ✅ Hecha (F11-A, PR #52 y F11-B2)   |
| F12 Distribución v1.0        | Workflow de release, instalador y portable, documentación final                                                                                  | ✅ Hecha (v1.0.0)                   |
| v1.1 Uso diario              | Orden natural, filtros numéricos, mejoras de colecciones, tamaño de las portadas, arrastrar y soltar, versión 1.1.0                              | ✅ Hecha (v1.1.1)                   |
| v1.2 Catálogos y formularios | Errores por campo en el formulario, fusionar valores duplicados, copiar catálogos de otro perfil, versión 1.2.0                                  | ✅ Hecha (v1.2.0)                   |
| v1.3 Tus datos               | Copias programadas, exportar e importar (JSON y CSV), estadísticas, versión 1.3.0                                                                | En curso (v1.3-A a v1.3-C hechas)   |

Cada fase se divide en entregas pequeñas (F5-A, F5-B…), cada una con su rama y su PR. Desde la v1.0, las entregas se nombran por versión (v1.1-A, v1.1-B…).

**Antes de la F10:** la mejora «Seleccionar» (seleccionar varios elementos o colecciones y enviarlos a la papelera, eliminarlos o quitarlos de una colección), acordada el 2026-11-08. ✅ Hecha. Ver el final del apartado 3.7.

---

## 3. Decisiones acordadas

### 3.1 Base técnica (implementado)

- Electron + TypeScript + React + SQLite (better-sqlite3) + sharp + electron-builder. Ver [ADR 0001](adr/0001-stack.md).
- Una base de datos por perfil (`library.db`) más `app.db` para perfiles y preferencias. Ver [ADR 0003](adr/0003-profiles.md).
- Migraciones solo hacia delante, con copia de seguridad previa y claves foráneas desactivadas durante la migración. Ver [ADR 0002](adr/0002-database-migrations.md).
- Seguridad de Electron: `contextIsolation`, `sandbox`, sin `nodeIntegration`, CSP estricta y preload mínimo. Todo lo que llega por IPC se valida con zod. Reforzada en la F12-A3 (permisos, remitente del IPC, ventanas nuevas y fusibles). Ver [ADR 0011](adr/0011-security.md).
- Repositorio público con licencia MIT. `main` protegida (PR y CI obligatorias), Dependabot semanal con 7 días de espera.

### 3.2 Perfiles y preferencias

**Implementado:**

- Nombre de 1 a 40 caracteres. Los repetidos (sin distinguir mayúsculas ni acentos) reciben el sufijo libre más bajo: «Carlos (1)».
- Se muestran solo por su nombre, sin avatar.
- Eliminar un perfil pide confirmación con botones Sí/No, resaltando su nombre. El perfil abierto no se puede eliminar.
- El idioma y el tema tienen un valor global que cada perfil puede sobrescribir. «Aplicar a todos los perfiles» está disponible.
- El idioma y el fondo se eligen al crear el perfil (el fondo desde la F10).
- Antes de eliminar un perfil se guarda una copia de seguridad automática; si falla, no se elimina (F11-A).

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
  - Fecha de adición automática.
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
  - Todos los tipos: Estado, Rejugado/Revisionada, Formato, Valoración (≥, ≤ y «sin valorar»), Favorito, Sagas, Géneros, Países de origen, Etiquetas y Compositores.
  - Videojuegos: Mis plataformas, Plataformas de lanzamiento, Distribuidoras y Desarrolladoras.
  - Películas y series: Productoras, Dirección y Reparto.
  - Desde la v1.1-B (apartado 3.11): año de lanzamiento (o de estreno), horas jugadas (videojuegos) y temporadas (series), con un tipo de campo nuevo, `number`.
- **Interfaz: dos pestañas, «Filtros simples» y «Filtros avanzados»** (acordado el 2026-11-04; sustituye a que el panel y el constructor compartieran un solo árbol):
  - Los filtros simples son listas de casillas: OR dentro de un atributo, AND entre atributos. Están en un panel plegable encima de la cuadrícula, que se abre con el botón «Filtros (N)», y se aplican al momento.
  - **En los simples** (acordado el 2026-11-05): una casilla «Favoritos» y otra «Rejugados» («Revisionadas» en películas y series), y en la valoración «Al menos» (en pasos de media estrella) y «Sin valorar», que se suman entre sí.
  - Los avanzados son un constructor de grupos AND/OR anidados. **«No favoritos» y «No rejugados» aparecen ahí**, no en los simples.
  - **En los avanzados** (acordado el 2026-11-06): hasta **3 niveles de grupos**, contando el principal; el motor admite 8, así que se podría ampliar. Los valores se eligen con un **desplegable normal**; el autocompletado queda como mejora anotada. Las condiciones a medias no se aplican ni cuentan.
  - Cada pestaña guarda sus propios filtros y **solo se aplica una**. La otra se ve atenuada y sus filtros se ignoran, pero no se borran.
  - Si la pestaña en uso tiene filtros, cambiar pide confirmación («Si continúas, se usarán los filtros avanzados y se ignorarán los filtros simples. No se borrarán: podrás volver a ellos.»), con el foco en «Cancelar». Si no tiene, se cambia directamente.
  - «Quitar filtros» solo vacía la pestaña en uso.
- **Valores que ofrecen los filtros** (acordado el 2026-11-04; sustituye al selector por tipo, que se queda solo en «Catálogos»): los que usa algún elemento de esa biblioteca, sin contar la papelera. No se reducen según lo ya marcado, así que una combinación puede dar cero resultados. Un valor marcado que deja de usarse o se elimina se desmarca solo. Con más de 10 valores, el atributo tiene su propio buscador (también por alias), y se dibujan como mucho 100.
- **Plataformas** (acordado el 2026-11-04): «Lo tengo en» pasa a llamarse **«Mis plataformas»** («My platforms») y «Publicado en», **«Plataformas de lanzamiento»** («Release platforms»), en los filtros, el formulario y la ficha.
- **Estado de la biblioteca** (acordado el 2026-11-04): la búsqueda, los filtros, el orden y la posición se guardan por modo hasta cerrar el perfil. Desde la F7-C, la posición es el primer elemento visible, y al volver su fila queda arriba de la ventana. Si ya no existe, se vuelve al lugar que ocupaba.
- **Ordenación:** por título (los «Sin nombre» al final), fecha de adición, valoración, fecha de lanzamiento más temprana y fechas de uso. Lo que no tiene dato va siempre al final, también en orden descendente. Al elegir un criterio, el título empieza de la A a la Z y el resto de mayor a menor (acordado el 2026-11-04); un botón invierte el sentido.
- **Cabecera:** con filtros activos, «(N)» es el número de resultados.
- **Rendimiento:** cuadrícula virtualizada con TanStack Virtual y una prueba con 10 000 elementos. No hacen falta índices nuevos; `items.list` devuelve todos los resultados, sin paginar.
- **Limitación conocida del teclado:** si el foco está en una tarjeta y te alejas con el ratón, esa tarjeta deja de existir y el foco se pierde. Avanzar y retroceder con Tab funciona.

**Entregas (acordadas el 2026-11-04):**

- F7-A: motor (árbol, registro, consulta, búsqueda, ordenación e IPC), sin cambios visibles. ✅ Hecha.
- F7-B: buscador, selector de orden, «(N)», aviso de «sin resultados» y estado por modo. ✅ Hecha.
- F7-C: cuadrícula virtualizada, con la prueba E2E de 10 000 elementos. ✅ Hecha.
- F7-D: filtros simples y nombres nuevos de las plataformas. ✅ Hecha.
- F7-E: filtros avanzados y las dos pestañas. ✅ Hecha.

### 3.7 Colecciones (F9)

El detalle técnico está en el [ADR 0007](adr/0007-collections.md).

- **Mixtas:** pueden contener videojuegos, películas y series, y se filtran por tipo.
- **Contenido:** nombre, portada opcional y modificable, y elementos añadidos a mano.
- **Integridad:**
  - Las colecciones guardan referencias, nunca copias de los elementos.
  - Un elemento en la papelera desaparece de sus colecciones, pero vuelve al restaurarlo.
  - Borrar una colección pide confirmación y nunca borra elementos.

**Acordado para la F9 (2026-11-07):**

1. **Entrada:** una cuarta tarjeta, «Colecciones», en la pantalla de modos.
2. **Nombre:** obligatorio, de 1 a 100 caracteres. Se rechaza si ya existe otro igual sin distinguir mayúsculas ni tildes.
3. **Orden:** los mismos criterios que la biblioteca, sin orden manual.
4. **Dentro de la colección:** selector de tipo (Todo, Videojuegos, Películas, Series), buscador y orden. Sin filtros por atributo, porque dependen del tipo.
5. **Añadir y quitar:** una ventana con casillas desde la colección y otra desde la ficha del elemento, con Guardar y Cancelar. Guardar hace de confirmación, porque quitar no borra el elemento.
6. **Borrar una colección:** definitivo, sin papelera, con confirmación y el foco en «Cancelar».
7. **Ficha del elemento:** una fila «Colecciones» solo si pertenece a alguna, y un botón para gestionarlas.

- **La interfaz envía solo los cambios** (qué añadir y qué quitar), nunca la lista completa: si no, se perderían las pertenencias de los elementos en la papelera, que no se muestran.
- **Ventana de una colección:** igual que la de un catálogo, no tiene aviso de cambios sin guardar.

**Entregas (acordadas el 2026-11-07):**

- F9-A: migración 0006, servicio, portada y barrido, consulta de elementos de una colección e IPC, sin cambios visibles. ✅ Hecha.
- F9-B: pantallas: tarjeta de modo, lista de colecciones, crear, editar y borrar, y la colección con su tipo, búsqueda, orden y posición recordada hasta cerrar el perfil. Cuando se vea «Todo», la tarjeta de cada elemento indicará su tipo. ✅ Hecha.
  - Una colección nueva se abre al crearla, igual que un elemento nuevo abre su ficha.
  - La tarjeta de cada colección indica cuántos elementos tiene, sin contar la papelera.
  - Con «Todo», el orden por fecha se llama «Fecha de lanzamiento o estreno».
  - Las ventanas anidadas (la de importación sobre la de la colección) se cierran por separado: Esc cierra solo la de arriba.
- F9-C: pertenencias: la ventana de casillas desde la colección (con tipo y buscador, como mucho 100 filas dibujadas) y la ventana y la fila «Colecciones» en la ficha. ✅ Hecha. Acordado el 2026-11-07:
  - En la ficha, los nombres de las colecciones son **enlaces** que abren la colección; «Volver» regresa a la ficha.
  - La ventana de la ficha permite **crear colecciones solo con el nombre**. Se crean al pulsar Guardar, así que Cancelar no deja nada; la portada se pone luego desde la colección. Un nombre repetido se avisa al momento.
  - La ventana de la colección empieza en el **tipo que se está viendo**; con «Todo», en Videojuegos. Las marcas se conservan al cambiar de tipo o de búsqueda, y un contador indica los cambios pendientes.
  - Los botones: «Añadir o quitar elementos» en la colección (y «Añadir elementos» si está vacía), y «Elegir colecciones», con el icono de colecciones, en la ficha.

**Mejora acordada tras la F9 (2026-11-08): seleccionar varios y actuar sobre ellos.** ✅ Hecha en su propia entrega (`feat/select-and-delete`), antes de la F10.

- **Motivo:** hasta ahora, un elemento o una colección solo se puede borrar desde dentro (su ficha o la pantalla de la colección). Los catálogos ya se borran desde su lista y no cambian.
- **Modo «Seleccionar»** (elegido frente a un icono de papelera en cada tarjeta, que quedaba junto a donde se hace clic para abrir, añadía una parada de teclado por tarjeta y borraba de una en una):
  - Un botón «Seleccionar» en la barra de herramientas. En el modo, cada tarjeta muestra una casilla y hacer clic en ella la marca o desmarca, en lugar de abrirla.
  - Una barra fija abajo: «N seleccionados · Seleccionar todo · [Acción] · Cancelar». «Seleccionar todo» marca todos los resultados de la búsqueda y los filtros actuales.
  - La acción pide confirmación con el foco en «Cancelar». Esc o «Cancelar» salen del modo sin cambiar nada.
  - La selección se guarda por identificador (funciona con la cuadrícula virtualizada) y se vacía al cambiar de pantalla, de búsqueda o de filtros.
  - Fuera del modo no cambia nada: no hay botones de borrar junto a las tarjetas. Borrar uno solo sigue pudiéndose desde su ficha o su pantalla.
- **Acción en cada pantalla:**

  | Pantalla                | Acción                                           | Confirmación                                             |
  | ----------------------- | ------------------------------------------------ | -------------------------------------------------------- |
  | Biblioteca              | Enviar a la papelera (se puede deshacer)         | «¿Enviar 3 elementos a la papelera?»                     |
  | Lista de colecciones    | Eliminar (definitivo)                            | «¿Eliminar 2 colecciones? Sus elementos no se eliminan.» |
  | Dentro de una colección | Quitar de la colección (siguen en la biblioteca) | «¿Quitar 4 elementos de «Favoritos»?»                    |

- **Por dentro:** canales nuevos para enviar varios elementos a la papelera (`items:move-many-to-trash`) y eliminar varias colecciones (`collections:delete-many`), cada uno en una sola transacción. Enviar a la papelera no borra archivos, así que no hay barrido; eliminar colecciones hace uno solo, si alguna tenía portada. Quitar de una colección usa `collections.changeMemberships`, que ya existe. Sin migraciones ni dependencias nuevas.
- **Acordado al implementarla (2026-11-08):**
  - **Todo o nada:** si un identificador no existe, la acción falla con el error traducido de siempre y no cambia nada. En el uso normal no ocurre; sirve para que un fallo de la interfaz no pase desapercibido.
  - Con todo marcado, «Seleccionar todo» pasa a ser **«Quitar la selección»**.
  - El botón «Seleccionar» va en la cabecera, junto a las demás acciones de la pantalla (la lista de colecciones no tiene barra de herramientas), y no aparece si no hay nada que seleccionar.
  - Cambiar solo el **orden** conserva la selección, porque los resultados son los mismos. Buscar, filtrar o cambiar de tipo la vacían, pero no salen del modo.
  - Esc sale del modo solo si no hay ningún diálogo abierto; con la confirmación abierta, solo la cierra.
  - En la colección, el texto de confirmación añade «Seguirán en la biblioteca».

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

El detalle técnico está en el [ADR 0008](adr/0008-backgrounds.md).

**Acordado para la F10 (2026-11-10):**

- **Galería común en `app.db`:** tabla `background_file` (migración `app/0002`) y archivos en `backgrounds\` junto a `app.db`, con las mismas reglas que la multimedia de la F6 (nombres por hash, sin duplicados, originales aparte, barrido). Funciona sin ningún perfil abierto.
- **Predeterminados:** 6 diseños abstractos propios en SVG (degradados y formas), incluidos en la app: sin problemas de licencia, ligeros y nítidos a cualquier resolución. Identificadores: `aurora`, `dusk`, `ocean`, `forest`, `ember` y `nebula`.
- **El fondo predeterminado es «Sin fondo»:** los perfiles existentes se siguen viendo igual. Al borrar un fondo, los perfiles que lo usaban (y el valor global, si era ese) pasan a «Sin fondo», no al fondo global.
- **Preferencias:** `background`, `backgroundBlur` (0 a 40 px; 8 por defecto), `backgroundImportChoice` (**propia**, aparte de la de las portadas, porque los fondos suelen ser enormes) y `backgroundMaxSide` (1920 a 7680 px; 3840 por defecto). Todas con valor global, valor propio de cada perfil y «Aplicar a todos los perfiles».
- **Borrar un fondo importado:** desde cualquier perfil, porque la galería es común. La confirmación dirá cuántos perfiles lo usan.
- **Sin borrador:** a diferencia de las portadas, importar un fondo lo añade a la galería al momento.

**Entregas (acordadas el 2026-11-10):**

- F10-A: migración `app/0002`, `BackgroundService` (preparar, confirmar, listar, borrar, barrido y limpieza al arrancar), rutas `ktms-media://background/…`, preferencias e IPC, sin cambios visibles. ✅ Hecha.
- F10-B: el fondo en la app: capa de fondo con desenfoque y velo para que el texto se lea, los 6 predeterminados y, en Ajustes, la sección «Fondo» (galería, importar, borrar, desenfoque, tamaño máximo y «Aplicar a todos los perfiles»). ✅ Hecha. Acordado el 2026-11-11:
  - **El desenfoque se guarda al soltar el deslizador.** Mientras se mueve, el fondo lo muestra al momento.
  - **Ajustes se desvanece mientras se sostiene el deslizador** (con el ratón o el teclado): solo queda su fila, para ver la app real con el fondo. Ajustes tiene un oscurecido más suave que las demás ventanas, para que se vea el fondo elegido detrás.
  - **El velo** (una capa del color del tema, al 62 %, entre la imagen y la interfaz, para que el texto se lea sobre cualquier imagen) **es fijo**. Se calibró con capturas en claro y en oscuro; si hace falta, puede pasar a ser un deslizador «Atenuación».
  - **Los predeterminados son nítidos:** no llevan desenfoque propio, así que el deslizador los trata igual que a una foto (0 px se ve nítido). El desenfoque por defecto, 8 px, les da un aspecto suave.
  - Un fondo recién importado pasa a ser el fondo al momento. Los importados se llaman «Fondo importado N», por orden de importación.
  - El selector de perfiles ya muestra el fondo global.
  - **La barra de desplazamiento va sobre el fondo** (acordado el 2026-11-11, tras probar la app): la ventana ya no se desplaza; lo hace el área bajo la barra superior, cuyo hueco de la barra es transparente. Así no queda una franja del color del tema a la derecha, el fondo no salta al entrar en la biblioteca y la barra superior queda siempre visible. Se probaron antes las barras superpuestas de Chromium (`OverlayScrollbar`), que Electron 44 en Windows ignora.
- F10-C, dividida en dos entregas (acordado el 2026-11-11):
  - **F10-C1: atenuación.** ✅ Hecha. Acordado:
    - Un deslizador «Atenuación» en Ajustes controla la opacidad del velo (0 a 90 %), con el mismo comportamiento que el desenfoque (Ajustes se desvanece mientras se sostiene, se guarda al soltar, «Aplicar a todos los perfiles»).
    - **Un valor por tema** (`backgroundDimLight` y `backgroundDimDark`): el deslizador cambia el del tema que se ve, y su etiqueta lo dice («Atenuación (tema claro)»). Con «Según el sistema», el del tema que tenga el sistema.
    - **Por defecto, 40 % en claro y 62 % en oscuro.**
    - Para que se lea con cualquier fondo y atenuación: **la barra superior tiene su propio velo** (el color del tema al 85 %), y **con un fondo, los textos grises secundarios** (el número junto al título, los avisos…) **son más oscuros en el tema claro y algo más claros en el oscuro**.
  - **F10-C2: perfiles.** ✅ Hecha. Acordado:
    - **Al crear un perfil se elige su fondo,** con la misma cuadrícula que en Ajustes (sin borrar, pero con «Importar…»). Empieza marcado el fondo global, y lo elegido se guarda como fondo propio del perfil, igual que el idioma: si después cambia el global, ese perfil conserva el suyo.
    - **La tarjeta de cada perfil se rellena con su fondo** (su miniatura, nunca el archivo completo), con el nombre en blanco sobre un degradado oscuro. Sin fondo, o si la imagen no carga, la tarjeta es la de siempre.
    - Cada perfil lleva solo su fondo propio (`ownBackground`, o `null` si sigue al global), y la tarjeta resuelve «el propio o el global» en la interfaz. Así sigue al fondo global en cuanto cambia, sin volver a pedir la lista.

### 3.9 Copias de seguridad (F11)

El detalle técnico está en el [ADR 0009](adr/0009-backups.md).

- **Ya existía:** la copia automática antes de cada migración (`VACUUM INTO`, en `backups/` de cada base).
- Copia y restauración manual en un `.zip` con la instantánea de la base de datos y los archivos de `media`; las miniaturas se regeneran.
- Antes de restaurar: validar el archivo, `integrity_check`, cerrar la sesión, sustituir los datos y reabrir.
- Copia automática antes de eliminar un perfil.

**Acordado para la F11 (2026-11-12):**

1. **Un perfil por copia**, no la app entera.
2. **Las preferencias propias del perfil entran en la copia.** Si usa un fondo importado que no existe al restaurar, pasa a seguir el fondo global.
3. **Retención:** las 5 copias previas a migrar más recientes de cada base de datos y las 10 copias automáticas más recientes (de todos los perfiles). Las manuales nunca se borran.
4. **Dos formas de restaurar:** como perfil nuevo (desde la pantalla de perfiles; un nombre repetido recibe «(1)») y sobre el perfil abierto (desde Ajustes, con confirmación y una copia automática previa del estado actual).
5. **Barra de progreso con porcentaje**, por bytes.

- **Librerías:** yazl (escribir) y yauzl (leer), por _streams_ y con ZIP64.
- **Validación al restaurar:** rutas del zip contra una lista cerrada (contra el _zip slip_), `integrity_check`, versión del esquema no más nueva que la de la app y SHA-256 de cada archivo de media. Se extrae a una carpeta temporal y solo se sustituye, renombrando carpetas, si todo es correcto.

**Entregas (acordadas el 2026-11-12):**

- **F11-A: crear copias.** ✅ Hecha. Acordado al implementarla (2026-11-13):
  - En Ajustes, con un perfil abierto, la sección «Copias de seguridad»: «Crear copia de seguridad…» (abre «Guardar como» en Documentos con el nombre `KeepToMyShelf - <perfil> - <fecha hora>.zip`) y «Abrir la carpeta de copias automáticas».
  - Tras guardar, «Copia guardada: «<archivo>».», y cuántos archivos de la biblioteca no se encontraron (borrados a mano), si falta alguno.
  - La ventana de progreso aparece cuando empieza la copia (no mientras «Guardar como» está abierto) y no se puede cerrar con Esc.
  - La confirmación de eliminar un perfil añade «Antes se guardará una copia de seguridad en la carpeta de copias automáticas.», y la ventana de progreso aparece encima mientras se guarda.
  - Las automáticas se llaman `<fecha hora:segundos> - <perfil> - before-delete.zip`, para que el explorador las ordene por fecha.
  - Mientras se escribe una copia, el barrido de la multimedia se aplaza, para no borrar un archivo que la copia aún tiene que leer.
- **F11-B: restaurar**, dividida en dos entregas (acordado el 2026-11-14):
  - **F11-B1: motor de restauración, sin cambios visibles.** ✅ Hecha. Validación, «Restaurar como perfil nuevo», «Restaurar sobre este perfil», reapertura de la sesión, IPC y pruebas con zips manipulados (rutas maliciosas, entradas desconocidas o repetidas, hash o CRC erróneos, base corrupta, de una versión más nueva o que no coincide con el manifiesto, zip truncado). Acordado:
    - **Restaurar sobre el perfil abierto conserva su nombre actual**, no el de la copia.
    - **Un perfil restaurado como nuevo tiene como fecha de creación la de la restauración.**
    - **El fondo importado se busca por su hash:** el manifiesto guarda ahora el SHA-256 del fondo importado del perfil (`importedBackground`, opcional; sigue siendo `formatVersion` 1), porque en otra instalación el mismo id puede ser otra imagen. Si no está en la galería, el perfil sigue el fondo global. En las copias de la F11-A, que no lo tienen, se conserva el id solo si existe.
    - **Orden al restaurar sobre el perfil abierto:** primero se extrae y se valida la copia (un zip malo no deja una copia automática inútil), después se guarda la copia automática `before-restore` (cuenta para las 10), se cierra la sesión, se cambian las carpetas y se reabre con un token nuevo. La interfaz primero ve el resumen de la copia (`backups:preview-restore`) y luego confirma (`backups:restore-over`).
    - **yauzl no comprueba el CRC-32:** lo comprueba el lector de la app en cada entrada, además del SHA-256 de cada archivo de media.
  - **F11-B2: interfaz y E2E.** ✅ Hecha. «Restaurar copia de seguridad…» en la pantalla de perfiles (también en la del primer perfil) y «Restaurar copia sobre este perfil…» en Ajustes, con confirmación (foco en «Cancelar»), ventana de progreso con las dos etapas (`stage`: «restore» y «backup») y, al terminar, la sesión nueva en `App.tsx`. Acordado (2026-11-15):
    - **Restaurar como perfil nuevo no pide confirmación** (no sustituye nada) **ni abre el perfil**: la lista muestra «Perfil «Ana» restaurado.» o, si el nombre estaba ocupado, que se ha restaurado como «Ana (1)».
    - **La confirmación de restaurar sobre el perfil** muestra el archivo, el perfil y la fecha de la copia y cuántas imágenes y documentos tiene, y avisa de que se sustituirá todo salvo el nombre y de que antes se guarda una copia del estado actual. La ventana de progreso dice «Paso 1 de 2: comprobando la copia…» y «Paso 2 de 2: guardando una copia del estado actual…».
    - **Tras restaurar sobre el perfil, Ajustes sigue abierto** con «Copia restaurada: «archivo».», y detrás el perfil vuelve a la pantalla de modos con sus preferencias nuevas (idioma, tema, fondo…) y sin la búsqueda, los filtros ni la posición recordados.
    - **Con cambios sin guardar en el editor**, el botón pregunta antes (Seguir editando, Descartar o Guardar), porque la restauración los perdería.
    - **Si falla con `backup.restore_failed`**, la sesión puede haberse cerrado y reabierto con un token que la interfaz no conoce: la interfaz vuelve a abrir el perfil (abrir uno cierra antes la sesión actual, así que no importa si no se cerró) y se queda en la misma pantalla, porque los datos no han cambiado.

### 3.10 Distribución (F12)

El detalle técnico está en el [ADR 0010](adr/0010-distribution.md).

- **Formato:** instalador NSIS por usuario (sin permisos de administrador) como principal, y versión portable como opción.
- **`release.yml`:** al crear una etiqueta `v*`, genera el instalador y el portable con sus checksums SHA-256, hace una prueba de humo del artefacto y crea un **release en borrador** que el responsable publica.
- **Sin firma de código:** se documenta el aviso de SmartScreen. Icono propio de la aplicación.

**Acordado para la F12 (2026-11-15):**

- **Sin actualizaciones automáticas en la v1** (necesitan `electron-updater`, y sin firma la comprobación es débil). Siguen en las mejoras anotadas.
- **Registro de cambios manual** (`CHANGELOG.md`, formato «Keep a Changelog»), sin release-please, que exigiría permitir a las Actions crear PR.
- **La primera versión publicada es la v1.0.0.** El workflow se prueba antes con la etiqueta `v1.0.0-rc.1`, cuyo borrador se puede borrar.
- El release se crea con la CLI `gh` del propio runner y el `GITHUB_TOKEN` del workflow (`contents: write` solo en ese trabajo), sin acciones de terceros ni tokens personales.

**Entregas (acordadas el 2026-11-15):**

- **F12-A: icono y empaquetado.** ✅ Hecha. Acordado (2026-11-16):
  - **Portable en `.zip`, no en un solo `.exe`.** El target `portable` de electron-builder descomprime toda la app en `%TEMP%` en cada arranque: 11 s cada vez, frente a 0,9 s del zip.
  - **El zip trae una carpeta `KeepToMyShelf\`** (así «Extraer aquí» no desparrama los archivos) con el `.exe`, todo lo que necesita y la carpeta `KeepToMyShelf Data\` con un `LEEME - README.txt`.
  - **La app es portable si existe `KeepToMyShelf Data` junto al `.exe`**, y entonces guarda ahí todos sus datos. Si no se puede escribir en ella, muestra un mensaje con la ruta en lugar de no abrirse.
  - **Instalador en español o inglés** según el sistema. Desinstalar no borra los datos.
  - **Icono:** tres lomos en una estantería (mando, claqueta y televisor), con la fuente en `build/icon.svg`.
- **F12-A2: estado de la ventana y pantalla completa** (añadida el 2026-11-16). ✅ Hecha. Acordado:
  - **La ventana se abre como se cerró:** maximizada o no, con su tamaño y su posición sin maximizar (al desmaximizar vuelve a ellos) y en pantalla completa si se cerró así. Se guarda en `window-state.json`, en la carpeta de datos, porque no es una preferencia del perfil. Si falta o está dañado, la ventana se abre con su tamaño por defecto (1280 × 800, centrada).
  - **Una posición fuera de todas las pantallas** (un monitor desconectado) se descarta: la ventana se abre centrada.
  - **Pantalla completa con F11 y con un botón** en la barra superior, junto al del tema («Pantalla completa» / «Salir de pantalla completa», con F11 en la descripción). **Esc no sale de la pantalla completa**, porque ya cierra diálogos y sale del modo «Seleccionar».
  - **Escalado de pantalla distinto del 100 %:** Electron redondea los tamaños y muestra la ventana uno o dos píxeles más alta de lo pedido. Para que no crezca en cada arranque, si el usuario no la toca se vuelve a guardar el tamaño leído, no el mostrado.
  - **Limitación de las pruebas:** `page.keyboard` de Playwright no pasa por el proceso principal, así que la E2E pulsa F11 con `webContents.sendInputEvent`, que sí lo hace, como una tecla real.
- **F12-A3: refuerzo de seguridad** (añadida el 2026-11-17, tras revisar la app con la lista de seguridad de Electron). ✅ Hecha. Ver el [ADR 0011](adr/0011-security.md):
  - **Se rechazan todos los permisos web** (cámara, micrófono, ubicación, notificaciones…), que Electron concedía por defecto.
  - **Solo la página de la app puede llamar por IPC:** cada mensaje se comprueba (marco principal y URL de la app); si no, `ipc.forbidden_sender`.
  - **Ninguna ventana nueva ni `<webview>`**, y la CSP añade `object-src`, `frame-src`, `base-uri` y `form-action` a `'none'`.
  - **Fusibles:** sin `ELECTRON_RUN_AS_NODE` ni `NODE_OPTIONS`, y validación de la integridad del `app.asar`. `--inspect` sigue activo para la prueba de humo.
  - Revisado sin cambios: no hay credenciales en el código ni en el historial, el SQL usa parámetros, no se inserta HTML, los errores no revelan rutas y las dependencias de la app no tienen vulnerabilidades conocidas.
- **F12-B: workflow de release y prueba de humo.** ✅ Hecha y probada con la etiqueta `v1.0.0-rc.1` el 2026-11-17 (en verde; el borrador y la etiqueta se borraron después). Procedimiento en [RELEASING.es.md](RELEASING.es.md). Acordado (2026-11-17):
  - **`release.yml`** con dos trabajos: `build` (Windows, solo lectura) comprueba la etiqueta frente a `package.json`, hace las comprobaciones de la CI **con las E2E**, empaqueta, hace la prueba de humo y escribe `SHA256SUMS.txt`. `release` (Linux, el único con `contents: write`) crea el **borrador** con `gh`, como _pre-release_ si la versión lleva sufijo.
  - **Texto del release: plantilla fija** (`.github/release-notes.md`, bilingüe: qué descargar, aviso de SmartScreen, cómo comprobar los checksums y enlace al `CHANGELOG.md`). Los cambios se copian al publicar.
  - **Prueba de humo** (`npm run test:smoke`): instala en silencio en una carpeta temporal, prueba la app instalada (versión, empaquetada, dónde guarda los datos, crear y abrir un perfil, permisos rechazados, fusible `runAsNode`) y la desinstala; después prueba el zip portable. Se niega a empezar si la app ya está instalada en el usuario. Se probó en el equipo del responsable (49 s), sin dejar rastro.
  - **La versión pasa a `1.0.0-rc.1`** para probar el workflow.
- **F12-C: documentación y versión 1.0.0**, en dos entregas (acordado el 2026-11-17):
  - **F12-C1: documentación final.** ✅ Hecha. Acordado:
    - **Los documentos públicos son bilingües, en archivos separados: el inglés es el principal** (`README.md`, `docs/ARCHITECTURE.md`…) y el español va en `*.es.md` (`README.es.md`, `docs/ARCHITECTURE.es.md`…). Cada uno empieza con el enlace «English | Español». Son: README, `ARCHITECTURE`, `DEVELOPMENT`, `TESTING`, `GIT-WORKFLOW` y `RELEASING`. **Al cambiar uno, se actualizan los dos.**
    - **Siguen solo en español** el ROADMAP, los ADR, la especificación y `CLAUDE.md`, que son documentos de trabajo. `ARCHITECTURE` resume los ADR para quien lea en inglés. Los documentos en español enlazan a las versiones `*.es.md`.
    - **`CHANGELOG.md`, un solo archivo** con dos bloques por versión, «Español» y «English», en el orden de la plantilla del release, para copiarlos tal cual al borrador. La v1.0.0 resume las funciones por área, sin el historial de cada PR.
    - **El README es para usuarios:** funciones, descarga, SmartScreen, dónde están los datos, copias, actualizar y desinstalar. Lo técnico pasa a `DEVELOPMENT`. **Sin capturas de pantalla**, porque quedarían desfasadas con cada cambio de la interfaz.
    - La disposición de los datos en disco pasa del apartado 4 de este documento a `ARCHITECTURE`.
    - `RELEASING` explica que GitHub no muestra la marca _Pre-release_ en los borradores.
  - **F12-C2: versión 1.0.0** (`chore/release-1.0.0`). ✅ Hecha: `npm version 1.0.0 --no-git-tag-version`, la versión 1.0.0 en el `CHANGELOG.md` con fecha 2026-11-18 y enlaces de comparación, y la F12 marcada como hecha. Antes del merge se pasó la prueba de humo en local con los archivos 1.0.0. Después del merge: la etiqueta `v1.0.0`, el borrador del workflow y su publicación, según [RELEASING.es.md](RELEASING.es.md). **La v1.0.0 se publicó el 2026-11-18.**
- **Tras la v1.0: la versión en el texto del release** (`fix/release-notes-version`, 2026-11-18). El workflow pasaba la plantilla tal cual y en la v1.0.0 hubo que poner `1.0.0` a mano. Ahora el trabajo `release` sustituye `<versión>` y `<version>` por la versión en una copia de la plantilla, y falla si el resultado no nombra los dos archivos reales una vez en cada idioma. La plantilla tiene un comentario en cada idioma donde se pega su bloque del `CHANGELOG.md` (sin su título ni las líneas de enlaces), y `RELEASING` lo explica.
- **Tras la v1.0: i18next 27 y react-i18next 18** (`chore/i18next-27`, 2026-11-18), juntas porque react-i18next 18 exige i18next 27.0.1 o posterior. Sin cambios en el código: fijamos `fallbackLng: 'es'` y `escapeValue: false`, no hay traducciones vacías, no declaramos `CustomTypeOptions` y no usamos `<Trans>`. Con la 27.1, un plural que no está traducido (en español, `many` para un millón) usa la forma `_other` en lugar de mostrar la clave.
- **Alerta de minimatch (Dependabot n.º 7, solo de desarrollo):** se espera a Dependabot, sin `overrides`. eslint 10.15.0 y typescript-eslint 8.73.0 corrigen la parte de ESLint; electron-builder 26.18.0 aún no tiene corrección (solo se usa al empaquetar, con patrones propios). Lo mismo para picomatch (GHSA-fc5q-39xc-vjpf), que aún no tiene versión corregida.

**Documentación:** `README`, `docs/ARCHITECTURE`, `docs/DEVELOPMENT`, `docs/TESTING`, `docs/GIT-WORKFLOW` y `docs/RELEASING` (en inglés y en español), y `CHANGELOG.md`. ✅ (F12-B y F12-C1)

### 3.11 Versión 1.1: uso diario (planificada el 2026-11-19)

**Objetivo:** mejoras pequeñas y medianas para el uso diario de la biblioteca, tomadas de las mejoras anotadas (apartado 6). Sin dependencias nuevas y sin rehacer tablas. Las migraciones nuevas siguen las reglas de siempre (solo hacia delante, con su prueba). Cada entrega tiene su rama y su PR, y se trabaja un chat por entrega. Antes de implementar cada una, se acuerda su detalle y se anota aquí.

**Entregas, en este orden:**

- **v1.1-A: orden natural de los números** en los títulos y los catálogos: «Final Fantasy 2» antes que «Final Fantasy 10». ✅ Hecha (`feat/natural-sort`). Ver el [ADR 0006](adr/0006-search-and-filters.md#orden-natural-de-los-números-v11-a). Acordado el 2026-11-19:
  - **Sin migración:** better-sqlite3 13 no permite registrar una _collation_, así que cada conexión registra la función SQL `natural_key` y las consultas ordenan con `ORDER BY natural_key(…)`. Se eligió frente a una columna con la clave porque no puede quedarse desfasada y el algoritmo se puede cambiar sin migrar. Con 10 000 títulos, ordenar cuesta unos 13 ms más.
  - **Se aplica también a las colecciones y los perfiles**, además de a los títulos (bibliotecas y colecciones, también como desempate de los demás criterios), los catálogos, los valores de los filtros y las relaciones de la ficha a igualdad de orden manual.
  - «007» y «7» empatan y decide el texto. Los números romanos no se interpretan.
- **v1.1-B: filtros numéricos:** año de lanzamiento, horas jugadas (videojuegos) y temporadas (series). ✅ Hecha (`feat/numeric-filters`). Ver el [ADR 0006](adr/0006-search-and-filters.md#campos-numéricos-v11-b). Acordado el 2026-11-19:
  - **Un tipo de campo nuevo, `number`**, con ≥, ≤ y «sin indicar». Sin migración: los datos ya existían.
  - **El año es el del lanzamiento más temprano**, como el orden por fecha de lanzamiento. En películas y series se llama «Año de estreno».
  - **Horas enteras**, comparadas con los minutos: 10:30 está en «Hasta 11», no en «Hasta 10».
  - **En los dos modos:** en los simples, una sección con «Desde» y «Hasta»; en los avanzados, una casilla numérica. **«Sin indicar» solo en los avanzados.** Un número no válido no se aplica, se marca en rojo y no cuenta, así que no activa «Quitar filtros» (igual que una fila avanzada a medias).
  - **`items.filterValues` devuelve también el rango** de cada número. En los simples, la sección solo aparece si algún elemento tiene el dato, y el rango se muestra como texto de ejemplo. En los avanzados los números se ofrecen siempre, como la valoración.
- **v1.1-C: colecciones:** un filtro «Colecciones» en las bibliotecas, ordenar una colección por la fecha en que se añadió cada elemento (ya se guardaba) y usar como portada de la colección la de uno de sus elementos. ✅ Hecha (`feat/collection-improvements`). Ver el [ADR 0007](adr/0007-collections.md#mejoras-de-la-v11-c-2026-11-20). El orden manual y los filtros por atributo siguen en las mejoras anotadas. Acordado el 2026-11-20:
  - **Una sola PR**, sin migración: `collection_item.added_at` ya existía y la portada usa la misma fila de `media_file` que el elemento.
  - **Filtro:** en los simples, una sección «Colecciones» con casillas (OR entre ellas y AND con lo demás) y su buscador a partir de 10. En los avanzados, el campo «Colecciones» con «es» y «no es». Solo se ofrecen las colecciones con algún elemento de esa biblioteca fuera de la papelera, y una colección marcada que se borra se desmarca sola.
  - **Orden:** «Fecha de adición» solo existe dentro de una colección y empieza por la más reciente. **El orden por la fecha de alta en la biblioteca, que antes se llamaba «Fecha de adición», pasa a llamarse «Fecha de alta»** («Date added to library» en inglés) en todas partes. La ficha sigue diciendo «Añadido el».
  - **Portada de un elemento:** un botón «Usar la portada de un elemento…» en la ventana de editar la colección, que no aparece al crearla (aún no tiene elementos). Se complementa con la portada propia, no la sustituye: se puede seguir importando una imagen. **Es una copia del momento, no un enlace:** si después cambia la portada del elemento, la de la colección no cambia.
- **v1.1-D: tamaño de las portadas** en la biblioteca, con un control para agrandarlas o reducirlas. ✅ Hecha (`feat/cover-size`). Ver el [ADR 0006](adr/0006-search-and-filters.md#tamaño-de-las-portadas-v11-d). Acordado el 2026-11-21:
  - **Un deslizador «Tamaño de las portadas»** en la barra de herramientas de las bibliotecas y de las colecciones, que elige el **número de columnas, de 3 a 10** (5 por defecto, como antes). La lista de colecciones no lo tiene.
  - **Una preferencia del perfil** (`libraryColumns`), común a las tres bibliotecas y a las colecciones, sin migración. Se conserva al cerrar la app y entra en las copias de seguridad.
  - **La biblioteca y las colecciones pasan de 64 a 96 rem** de ancho máximo, con margen a los lados en monitores anchos.
  - **Las tarjetas miden al menos 6 rem**, así que en ventanas estrechas caben menos columnas de las elegidas (8 en la ventana mínima).
  - **Las portadas grandes siguen nítidas:** la cuadrícula elige la miniatura (320 o 640 px) por el ancho de la tarjeta.
  - La posición se recupera con el tamaño elegido. La barra de herramientas no se queda fija arriba.
- **v1.1-E: arrastrar y soltar** imágenes y PDF en las zonas del formulario del elemento (portada, galería y documentos). ✅ Hecha (`feat/drag-and-drop`). Ver el [ADR 0011](adr/0011-security.md#arrastrar-y-soltar-v11-e). Acordado el 2026-11-19 y completado el 2026-11-22:
  - **La interfaz sigue sin manejar rutas.** La función del preload recibe solo objetos `File` del arrastre, obtiene su ruta con `webUtils.getPathForFile` y la envía ella misma al proceso principal (`media:prepare-dropped`). Un `File` creado por código no tiene ruta, así que la interfaz no puede pedir que se lea un archivo que el usuario no ha soltado.
  - **El proceso principal rechaza las rutas de red** (`\\servidor\…`, y con ellas las que empiezan por dos barras), que en Windows pueden enviar al servidor una huella de la contraseña de la sesión (NTLM), y con `lstat` todo lo que no sea un archivo normal (carpetas, enlaces). Después, la importación pasa por las mismas comprobaciones de contenido y tamaño que con la ventana «Abrir». Las unidades de red con letra se aceptan.
  - Cada zona acepta solo lo suyo. Lo demás se rechaza con su nombre y el motivo, como en los diálogos. **Varios archivos soltados en la portada se rechazan todos**, con el aviso «Suelta una sola imagen como portada». Soltar fuera de una zona no hace nada (cursor de «no permitido»). Las imágenes arrastradas desde un navegador, sin archivo en el disco, se rechazan con un aviso.
  - Cada zona muestra «o arrástrala(s) aquí» junto a su botón y se resalta al pasar un archivo por encima. La portada de las colecciones usa el mismo campo, pero sin arrastre.
  - **Pruebas:** las E2E sí sueltan archivos reales del disco: los cargan en un `<input type="file">` temporal con `setInputFiles` y los sueltan con los eventos de arrastre ([TESTING.es.md](TESTING.es.md#limitaciones-conocidas)). Las pruebas unitarias cubren el preload y las rutas rechazadas. El arrastre desde el Explorador y desde un navegador se prueba a mano.
  - Fuera de esta entrega: arrastrar fondos en Ajustes y la portada de una colección.
- **v1.1-F: versión 1.1.0** (`chore/release-1.1.0`). ✅ Hecha, como la F12-C2: `npm version 1.1.0 --no-git-tag-version`, la versión 1.1.0 en el `CHANGELOG.md` con fecha 2026-11-22 y enlaces de comparación, y la v1.1 marcada como hecha. Antes del merge se pasó la prueba de humo en local con los archivos 1.1.0. Después del merge: la etiqueta `v1.1.0`, el borrador del workflow y su publicación, según [RELEASING.es.md](RELEASING.es.md). **El workflow de `v1.1.0` falló**, así que la 1.1.0 no se publicó (ver la v1.1-G).
- **v1.1-G: versión 1.1.1** (`fix/smoke-test-unzip`). Acordado el 2026-11-23. La prueba de humo del workflow pasó con el instalador, pero falló al descomprimir el zip portable: en GitHub Actions, PowerShell 7 lanza el script con Windows PowerShell 5.1, que hereda `PSModulePath` y carga el `Expand-Archive` de PowerShell 7, incompatible con el .NET Framework. En local no ocurría porque no hay PowerShell 7 de por medio.
  - El script descomprime con `[IO.Compression.ZipFile]::ExtractToDirectory`, que existe en los dos .NET.
  - Según [RELEASING.es.md](RELEASING.es.md#si-algo-sale-mal), una etiqueta subida no se mueve: `v1.1.0` se queda sin release y se publica la **1.1.1**, con los mismos cambios en la aplicación. El `CHANGELOG.md` marca la 1.1.0 como no publicada, y RELEASING aclara qué etiqueta usar cuando falla una versión definitiva.
  - **Publicada el 2026-11-23** como «Latest», con las notas de la 1.1.1 y de la 1.1.0. La etiqueta `v1.1.1` pasó el workflow completo, con la prueba de humo del zip portable.

### 3.12 Versión 1.2: catálogos y formularios (planificada el 2026-11-23)

**Objetivo:** las tres mejoras de catálogos y formularios anotadas en el apartado 6. Se siguen las mismas reglas que en la v1.1: sin dependencias nuevas, y las migraciones (si alguna hiciera falta) solo hacia delante y con su prueba. Cada entrega tiene su rama y su PR, y se trabaja un chat por entrega. Antes de implementar cada una, se acuerda su detalle y se anota aquí.

**Orden:** la fusión va antes que la copia, porque copiar catálogos de otro perfil trae casi duplicados («Playstation 5» y «PlayStation 5»), y así la herramienta para fusionarlos ya existe.

**Entregas, en este orden:**

- **v1.2-A: errores por campo en el formulario del elemento.** ✅ Hecha (`feat/field-errors`). Antes, la validación se detenía en el primer error y lo mostraba en un aviso general. Acordado el 2026-11-23:
  - **Todos los errores a la vez:** la validación reúne todos los errores en lugar de detenerse en el primero, y cada campo con error se marca (`aria-invalid` y el mensaje debajo, enlazado con `aria-describedby`). Al guardar, el foco va al primer campo con error, en el orden de la pantalla.
  - **Solo el formulario del elemento**, que es el que tiene muchos campos. Los diálogos de catálogos, colecciones y perfiles tienen uno o dos campos y ya muestran el error junto al campo.
  - **Cuándo aparece y desaparece un error:** los errores aparecen solo al pulsar «Guardar». El de un campo desaparece en cuanto ese campo es válido, mientras se corrige; los errores nuevos de otros campos esperan al siguiente «Guardar». Así no parpadean errores mientras se escribe (por ejemplo, «1» al escribir el año 1990). El nombre vacío de un documento ya no se marca al momento, sino al guardar, como los demás.
  - **Se marca la parte concreta de una fecha** (día, mes o año). Si el fin es anterior al inicio, se marca el año del fin.
  - **Resumen junto a «Guardar»:** «Revisa los N campos marcados.», que se actualiza al corregir. Los errores que no son de un campo (más de 50 títulos alternativos, un error del proceso principal…) siguen en ese aviso.
  - **Reglas sin duplicar:** en `core/`, `checkItemDraft` reúne los errores del borrador por campo (`title`, `startedOn`, `releases.<n>`…) con un recolector (`FieldErrorCollector`, en `core/field-errors.ts`), y `validateItemDraft` lanza el primero, en el mismo orden de siempre, así que el proceso principal no cambia. El formulario (`checkItemForm`) reúne los errores al leer el texto (año que falta, horas no numéricas…) y traduce los campos del borrador a sus controles; los nombres de los documentos se comprueban con `documentLabelErrors`.
- **v1.2-B: fusionar valores duplicados** de un catálogo. ✅ Hecha (`feat/merge-catalog-values`). Ver el [ADR 0004](adr/0004-catalogs.md#fusionar-valores-v12-b). Acordado el 2026-11-23:
  - **«Fusionar con…»** en cada valor de la pantalla «Catálogos»: se elige otro valor **del mismo catálogo**, que se conserva. Sus elementos, sus fechas de lanzamiento (si es una región) y sus alias pasan al valor conservado, y **el nombre del valor fusionado se convierte en un alias**, para que se siga encontrando por él.
  - **Confirmación** con los dos nombres y el número de elementos afectados, con el foco en «Cancelar».
  - **Sugerencias de duplicados probables:** valores cuyo nombre coincide sin distinguir mayúsculas ni tildes (`name_key`), o cuyo nombre coincide con un alias de otro valor. **Nunca se fusiona nada solo**: la sugerencia lleva a la misma confirmación.
  - Completado el 2026-11-24, sin migración:
    - **Un elemento con los dos valores en el mismo papel** lo guarda una vez, en la posición del conservado. Si solo tenía el fusionado, el conservado ocupa su posición.
    - **Las fechas de lanzamiento que quedan idénticas** (mismo elemento, región y fecha) se guardan una vez; las de fecha distinta se conservan.
    - **Si el ámbito de dos géneros difiere**, el conservado pasa a «Películas y series», y la confirmación lo avisa.
    - **Más de 50 alias:** la fusión se rechaza sin cambiar nada.
    - **No se añaden como alias los nombres que solo se diferencian en mayúsculas o tildes** de uno que ya está, porque la búsqueda ya los encuentra. Matiza lo acordado el 2026-11-23.
    - **«Intercambiar»**, en la confirmación, elige conservar el otro valor. La confirmación avisa de que no se puede deshacer.
    - **Sugerencias:** un bloque plegado, «Posibles duplicados (N)», sobre la lista, solo si hay alguno. Mira el catálogo entero, sin el tipo ni la búsqueda. Entre los nombres que coinciden se propone conservar el más usado; si el nombre es alias de otro valor, el que tiene el alias.
    - El valor fusionado se desmarca de los filtros recordados, como al eliminarlo. La fecha de modificación de los elementos no cambia.
- **Cambio de nombre** (`fix/composer-label`, 2026-11-24): «Música» pasa a llamarse **«Compositores»** («Composers» en inglés) en los tres tipos, porque el campo guarda personas y «Música» era ambiguo. Solo cambia el texto visible. La misma rama añade al `CHANGELOG.md` las entradas de la v1.2-A y la v1.2-B, que faltaban.
- **v1.2-C: copiar catálogos de otro perfil.** ✅ Hecha (`feat/copy-catalogs`). Ver el [ADR 0004](adr/0004-catalogs.md#copiar-de-otro-perfil-v12-c). Acordado el 2026-11-23:
  - Se elige el **perfil de origen** y **qué catálogos** copiar (cualquiera de los nueve). Se copian los valores con sus alias y su ámbito, **sin relaciones con elementos**.
  - **Los valores que ya existen con el mismo nombre exacto se omiten.** Al terminar, un resumen: «N copiados, M ya existían».
  - **La interfaz no toca la base de datos de otro perfil:** pide la copia por IPC, y el proceso principal abre el `library.db` de origen en solo lectura. (La copia de seguridad antes de borrar un perfil, que se citaba aquí como ejemplo, lo abre en lectura y escritura.)
  - Completado el 2026-11-24, sin migración:
    - **«Copiar de otro perfil…»** está en la cabecera de «Catálogos», solo si hay otro perfil.
    - **Un origen con un esquema anterior se rechaza**: hay que abrir ese perfil una vez.
    - **Un nombre que coincide con un alias, o que solo cambia en mayúsculas o tildes, se copia**, y aparece en «Posibles duplicados».
    - **Un valor con el mismo nombre exacto no cambia**, aunque el del origen tenga otros alias o ámbito.
    - **Ningún catálogo empieza marcado.** Cada uno indica cuántos valores son nuevos y cuántos ya existen; los que no tienen nada nuevo están desactivados.
    - **Todo o nada**, sin otra confirmación, porque solo añade valores.
- **v1.2-D: versión 1.2.0** (`chore/release-1.2.0`). ✅ Hecha, como la v1.1-F: `npm version 1.2.0 --no-git-tag-version`, la versión 1.2.0 en el `CHANGELOG.md` con fecha 2026-11-24 y enlaces de comparación, y la v1.2 marcada como hecha. Antes del merge se pasó la prueba de humo en local con los archivos 1.2.0. Después del merge: la etiqueta `v1.2.0`, el borrador del workflow y su publicación, según [RELEASING.es.md](RELEASING.es.md). **La v1.2.0 se publicó el 2026-11-25.**

### 3.13 Versión 1.3: tus datos (planificada el 2026-11-25)

**Objetivo:** proteger, sacar, traer y resumir los datos de la biblioteca. Se siguen las mismas reglas que en la v1.2: sin dependencias nuevas, y las migraciones (si alguna hiciera falta) solo hacia delante y con su prueba. Cada entrega tiene su rama y su PR, y se trabaja un chat por entrega. Antes de implementar cada una, se acuerda su detalle y se anota aquí.

**Orden:** las copias programadas van primero, para tener más protección antes de las importaciones. Exportar va antes que importar, para poder probar el ciclo completo.

**Entregas, en este orden:**

- **v1.3-A: copias programadas.** ✅ Hecha (`feat/scheduled-backups`). Ver el [ADR 0009](adr/0009-backups.md#copias-programadas-v13-a). Acordado el 2026-11-25:
  - En Ajustes, cada perfil elige nunca, diaria, semanal o mensual.
  - **Las hace la propia app al abrir el perfil**, en segundo plano, si ha pasado el plazo desde la última. No se usa el Programador de tareas de Windows ni se deja la app en segundo plano al cerrarla.
  - **Cupo aparte:** se conservan las 10 últimas de cada perfil (número fijo), en una carpeta con el identificador del perfil, porque su nombre puede cambiar. No cuentan para las 10 automáticas, que siguen como en el [ADR 0009](adr/0009-backups.md).
  - Completado el 2026-11-25, sin migración:
    - **Por defecto, cada semana**, también en los perfiles que ya existían, contada desde la última copia o desde la creación del perfil. El plazo son días naturales.
    - **La fecha de la última copia es la del nombre de su archivo.**
    - **Sin cambios desde la última, no se hace** (biblioteca, preferencias, nombre del perfil y archivos que faltan).
    - **La acción del usuario manda:** copiar, restaurar o eliminar un perfil cancela la copia programada en curso, que se reintenta al volver a abrir el perfil. Cambiar de perfil no la cancela; cerrar la app la abandona.
    - **Eliminar un perfil elimina sus copias programadas**, y la confirmación lo dice. Si su biblioteca ya no existía, se conservan.
    - **Si falla, un aviso que se puede cerrar.** Si va bien, no se dice nada; Ajustes muestra la fecha de la última y abre su carpeta.
- **v1.3-B: exportar.** ✅ Hecha (`feat/export-library`). Ver el [ADR 0012](adr/0012-export.md). Acordado el 2026-11-25:
  - **JSON completo y versionado** (elementos, catálogos y colecciones) y **CSV por tipo**, para hojas de cálculo.
  - **Sin imágenes ni PDF:** para eso está la copia de seguridad `.zip`. La interfaz lo avisa.
  - Completado el 2026-11-25, sin migración:
    - **En Ajustes, la sección «Exportar»**, con un perfil abierto: qué exportar, el separador (solo con CSV) y «Exportar…».
    - **La papelera va en el JSON**, marcada, y la interfaz lo avisa. **En el CSV no.**
    - **CSV en UTF-8 con BOM**, con el separador a elegir: por defecto, `;` en español y `,` en inglés.
    - **Contra las fórmulas**, se antepone `'` a las celdas que podrían serlo, de forma que la v1.3-D pueda deshacerlo.
    - **Cabeceras y valores del CSV en el idioma del perfil.** La v1.3-D aceptará los dos idiomas, los dos separadores y los dos decimales.
    - **Varios valores en una celda:** `|`. La valoración, en estrellas, con el decimal que corresponde al separador. Los elementos sin título, con la celda vacía.
    - **El JSON no lleva ids internos:** UUID para elementos y colecciones, y nombres para los valores de catálogo.
- **v1.3-C: importar JSON.** ✅ Hecha (`feat/import-json`). Ver el [ADR 0013](adr/0013-import.md). Acordado el 2026-11-25:
  - Resumen previo, confirmación, copia automática e importación en una sola transacción.
  - **Un elemento con un UUID que ya existe, también en la papelera, se omite.** Nunca se sobrescribe nada.
  - Completado el 2026-11-26, sin migración ni dependencias nuevas:
    - **En Ajustes, la sección «Importar»**, con un perfil abierto: «Importar desde JSON…». Si el archivo no tiene nada nuevo, se dice sin pedir confirmación.
    - **Los elementos de la papelera del archivo se importan a la papelera**, y la confirmación lo avisa. **Se conservan sus fechas de alta y de modificación.**
    - **Valores de catálogo por nombre exacto**, como al copiar catálogos: los existentes no cambian. **Un género del perfil limitado al otro tipo pasa a «Películas y series»**, como al fusionar, y la confirmación lo avisa.
    - **Colecciones por UUID:** a las existentes solo se les añaden elementos. Una colección nueva con el nombre ocupado recibe «(1)», «(2)»…
    - **El número de «Sin nombre» se conserva si está libre**; si no, el libre más bajo.
    - **Todo o nada:** cada elemento que se añade pasa las reglas del formulario, y el primero que no las cumple impide importar; se indica su posición, su título y el motivo. Límite de 100 MB.
    - **Copia automática `before-import`**, que cuenta para las 10 automáticas.
    - **Tras importar, la pantalla abierta se vuelve a cargar**; con cambios sin guardar en el editor, se pregunta antes.
    - La escritura de los atributos de un elemento pasa de `ItemService` a `infrastructure/db/item-writer.ts`, para que el formulario y la importación guarden igual.
- **v1.3-D: importar CSV.** Acordado el 2026-11-25:
  - **Plantilla de columnas fija**, con vista previa y errores por fila. Asignar las columnas de cualquier CSV queda en las mejoras anotadas.
  - **Si coinciden el título y el tipo con un elemento existente, se avisa** y se elige si omitirlo, que es lo marcado por defecto.
- **v1.3-E: estadísticas.** Acordado el 2026-11-25: una pantalla del perfil con totales, estados, valoraciones, horas, terminados por año, géneros y plataformas. Cifras y barras propias en HTML y CSS, sin librería de gráficos. No cuenta la papelera.
- **v1.3-F: versión 1.3.0**, como la v1.2-D.

---

## 4. Disposición de los datos en disco

Desde la F12-C1 está en [ARCHITECTURE.es.md](ARCHITECTURE.es.md#datos-en-disco). Al añadir una carpeta o un archivo, se actualiza allí (y en `ARCHITECTURE.md`).

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
- **F8 sin entregas propias:** su contenido se hizo en la F4 y la F5.

---

## 6. Mejoras anotadas (fuera del alcance actual)

Ordenadas por versión el 2026-11-19, al planificar la v1.1, y revisadas el 2026-11-23, al planificar la v1.2, y el 2026-11-25, al planificar la v1.3. Lo que entra en la v1.1 está en el apartado 3.11; lo de la v1.2 (fusionar duplicados, copiar catálogos de otro perfil y errores por campo), en el 3.12; y lo de la v1.3 (copias programadas, exportar, importar y estadísticas), en el 3.13.

**Calidad, cuando encaje** (cambia los workflows, así que necesita permiso):

- Ejecutar las E2E también en Linux (con xvfb) y medir la cobertura (objetivos: `core/` ≥ 90 %, `application/` e `infrastructure/` ≥ 80 %).

**v2.0 o más adelante:**

- **Anime** como cuarto tipo (series, películas, ONA, OVA). Requiere una migración que rehaga `item`.
- **Libros** como tipo nuevo, junto a videojuegos, películas, series y el futuro anime (añadido el 2026-11-19). Igual que el anime, requiere rehacer `item`, porque los tipos están limitados por un `CHECK` en la migración `0001`. Conviene hacer los dos tipos en la misma migración. Quedan por decidir sus campos propios (autoría, editorial, páginas, ISBN, si se incluyen cómics y audiolibros…), sus estados («Leído», «Releído»), sus papeles en los catálogos y sus listas iniciales de géneros.
- Visor de PDF integrado (pdf.js).
- Integración opcional con APIs (IGDB, TMDB) e importación masiva.
- Sincronización entre dispositivos.
- Actualizaciones automáticas y firma de código.
- Servir la interfaz con un protocolo propio en lugar de `file://`, para desactivar también el fusible `grantFileProtocolExtraPrivileges` (ver el [ADR 0011](adr/0011-security.md)).
- Versiones para Linux y macOS.
- Plugins.

**Sin versión asignada:**

- Importar cualquier CSV, asignando sus columnas a los campos de la app (anotada al planificar la v1.3).
- Descartar una sugerencia de duplicado («Hipo» e «Hipó» son distintos) para que no vuelva a aparecer (anotada en la v1.2-B). Hay que guardarlo en el perfil.
- Agrupar las plataformas por fabricante en pantalla (necesita un campo nuevo).
- Optimizar PDF escaneados (opcional). Necesita una herramienta externa: sharp no trabaja con PDF, Ghostscript (la que de verdad los reduce) tiene licencia AGPL, y qpdf o pdf-lib apenas reducen. Recomprimir puede degradar escaneos o romper formularios y firmas.
- Elegir los valores de los filtros avanzados con autocompletado (también por alias), en lugar de un desplegable, si las listas se hacen muy largas.
- Colecciones: orden manual y filtros por atributo al elegir un tipo.
- Arrastrar y soltar también los fondos de Ajustes y la portada de una colección, con el mecanismo de la v1.1-E.
- Seguimiento por temporada o episodio; varias sesiones de juego o visionado.
- Barra de herramientas de la biblioteca fija arriba al desplazarse, para buscar, ordenar o cambiar el tamaño de las portadas sin volver arriba (anotada en la v1.1-D).
