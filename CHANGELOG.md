# Changelog

All notable changes to KeepToMyShelf, in Spanish and English. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/).

Todos los cambios importantes de KeepToMyShelf, en español y en inglés. El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/), y el proyecto sigue el [versionado semántico](https://semver.org/lang/es/).

## [Unreleased]

## [1.3.0] - 2026-11-27

### Español

#### Añadido

- **Copias programadas:** al abrir un perfil, la app guarda una copia de seguridad en segundo plano si toca y hay cambios desde la última. En Ajustes, cada perfil elige nunca, cada día, cada semana (por defecto) o cada mes. Se conservan las 10 últimas de cada perfil, y se eliminan con él.
- **Exportar la biblioteca**, desde Ajustes: todos los datos en un archivo JSON (elementos, catálogos y colecciones, con la papelera) o los videojuegos, las películas o las series en un CSV para hojas de cálculo. No incluye imágenes ni documentos.
- **Importar una biblioteca exportada en JSON**, desde Ajustes, de este perfil o de otro. Primero muestra qué se añadirá y pide confirmación, y antes de importar guarda una copia automática. Solo añade lo que falta: los elementos y las colecciones que ya existen no se modifican.
- **Importar un CSV** de videojuegos, películas o series, desde Ajustes, con las columnas de la exportación (en español o en inglés y en cualquier orden; solo «Título» es obligatoria). Si alguna fila tiene errores, se indican por fila y columna y no se importa nada. Las filas cuyo título ya existe se muestran, y por defecto se omiten.
- **Estadísticas**, junto a «Catálogos» en la pantalla de modos: totales, estados, valoraciones, horas jugadas, terminados por año, géneros y plataformas, de toda la biblioteca o de un tipo. No cuentan los elementos de la papelera.

### English

#### Added

- **Scheduled backups:** when a profile is opened, the app saves a backup in the background if one is due and something has changed since the last one. In Settings, each profile chooses never, every day, every week (by default) or every month. The last 10 of each profile are kept, and they are deleted with it.
- **Export the library**, in Settings: all the data in a JSON file (items, catalogs and collections, with the trash), or the video games, movies or series in a CSV file for spreadsheets. Images and documents are not included.
- **Import a library exported to JSON**, in Settings, from this profile or another one. It first shows what will be added and asks for confirmation, and an automatic backup is saved before importing. It only adds what is missing: items and collections that already exist are not changed.
- **Import a CSV file** of video games, movies or series, in Settings, with the columns of the export (in English or Spanish and in any order; only "Title" is required). If any row has errors, they are listed by row and column and nothing is imported. Rows whose title already exists are shown, and left out by default.
- **Statistics**, next to "Catalogs" on the mode screen: totals, statuses, ratings, hours played, completed by year, genres and platforms, of the whole library or of one kind. The trash is not counted.

## [1.2.0] - 2026-11-24

### Español

#### Añadido

- **Fusionar valores duplicados** de un catálogo, con «Fusionar con…»: los elementos, las fechas de lanzamiento y los otros nombres de un valor pasan al que se conserva. Los catálogos sugieren los posibles duplicados, y nunca se fusiona nada sin confirmarlo.
- **Copiar catálogos de otro perfil**, desde «Catálogos»: se eligen el perfil y los catálogos, y se añaden los valores que faltan, con sus otros nombres. Los que ya existen no cambian, y el otro perfil tampoco.

#### Cambiado

- El **formulario del elemento muestra todos los errores a la vez**, cada uno junto a su campo, y va al primero al guardar.
- El campo «Música» pasa a llamarse **«Compositores»**.

### English

#### Added

- **Merge duplicate values** of a catalog, with "Merge with…": the items, release dates and other names of a value pass to the one that is kept. The catalogs suggest possible duplicates, and nothing is ever merged without confirmation.
- **Copy catalogs from another profile**, in "Catalogs": choose the profile and the catalogs, and the missing values are added, with their other names. Those that already exist do not change, and neither does the other profile.

#### Changed

- The **item form shows every error at once**, each next to its field, and goes to the first one when saving.
- The "Music" field is now called **"Composers"**.

## [1.1.1] - 2026-11-23

### Español

Publica los cambios de la 1.1.0, que no llegó a publicarse. La aplicación no cambia.

#### Corregido

- La prueba automática de la versión portable, que impidió publicar la 1.1.0.

### English

Publishes the changes of 1.1.0, which was never published. The app does not change.

#### Fixed

- The automated test of the portable version, which kept 1.1.0 from being published.

## [1.1.0] - 2026-11-22

No publicada: el workflow de la release falló en la prueba de la versión portable. Sus cambios se publican con la 1.1.1. / Not published: the release workflow failed in the test of the portable version. Its changes are published with 1.1.1.

### Español

#### Añadido

- **Filtros numéricos:** año de lanzamiento (o de estreno), horas jugadas y temporadas. En los filtros simples, con «Desde» y «Hasta»; en los avanzados, con «al menos», «como mucho» y «sin indicar».
- **Filtro «Colecciones»** en las bibliotecas, en los filtros simples y en los avanzados («es» y «no es»).
- **Ordenar una colección por la fecha de adición**, es decir, por cuándo se añadió cada elemento a ella.
- **Usar como portada de una colección la de uno de sus elementos**, sin volver a importar la imagen.
- **Tamaño de las portadas:** un deslizador en las bibliotecas y las colecciones elige entre 3 y 10 columnas. Se guarda en el perfil.
- **Arrastrar y soltar** imágenes y PDF desde el Explorador en la portada, la galería y los documentos del formulario del elemento. Los archivos de ubicaciones de red y las imágenes arrastradas desde un navegador se rechazan con un aviso.

#### Cambiado

- Los **números de los títulos y los nombres** se ordenan por su valor: «Final Fantasy 2» va antes que «Final Fantasy 10». Afecta a las bibliotecas, las colecciones, los catálogos, los filtros y los perfiles.
- El orden «Fecha de adición» de las bibliotecas pasa a llamarse **«Fecha de alta»**. «Fecha de adición» es ahora el nuevo orden de las colecciones.
- Las **bibliotecas y las colecciones aprovechan más el ancho** de las ventanas grandes, con margen a los lados.

### English

#### Added

- **Number filters:** release (or premiere) year, hours played and seasons. In the simple filters, with "From" and "To"; in the advanced filters, with "at least", "at most" and "not set".
- **"Collections" filter** in the libraries, in both the simple and the advanced filters ("is" and "is not").
- **Sort a collection by date added**, that is, by when each item was added to it.
- **Use the cover of one of its items as a collection's cover**, without importing the image again.
- **Cover size:** a slider in the libraries and collections chooses between 3 and 10 columns. It is saved in the profile.
- **Drag and drop** images and PDFs from the File Explorer onto the cover, gallery and documents of the item form. Files from network locations and images dragged from a web browser are refused with a notice.

#### Changed

- **Numbers in titles and names** are sorted by value: "Final Fantasy 2" comes before "Final Fantasy 10". This applies to libraries, collections, catalogs, filters and profiles.
- The "Date added" sort of the libraries is now called **"Date added to library"**. "Date added" is now the new sort of the collections.
- **Libraries and collections use more of the width** of large windows, with some margin at the sides.

## [1.0.0] - 2026-11-18

### Español

Primera versión publicada.

#### Añadido

- **Perfiles** independientes, cada uno con su biblioteca, sus catálogos, sus colecciones y sus preferencias. Antes de eliminar un perfil se guarda una copia de seguridad automática.
- **Tres bibliotecas**, videojuegos, películas y series, con una cuadrícula de portadas que conservan su proporción y alineadas como libros en una estantería. Funciona con bibliotecas de miles de elementos.
- **Fichas** con títulos alternativos, descripción, fechas de lanzamiento por región, plataformas, géneros, sagas, empresas, personas y su papel, países de origen, valoración con medias estrellas, estado, «Rejugado» o «Revisionada», fechas de inicio y fin con precisión de día, mes o año, horas jugadas, temporadas y capítulos, formato físico o digital, favorito, etiquetas y notas.
- **Catálogos editables** (plataformas, géneros, sagas, empresas, personas, etiquetas, regiones y países) con alias, listas iniciales en el idioma del perfil y sin referencias rotas.
- **Portada, galería de imágenes y documentos PDF** en cada elemento. Las imágenes se pueden optimizar (WebP), conservando o no el original; se generan miniaturas y no se guardan duplicados. Los PDF se abren con el visor del sistema.
- **Búsqueda** por título sin distinguir mayúsculas ni tildes, **filtros simples**, **filtros avanzados** con grupos Y/O y **ordenación** por título, fecha de adición, valoración, fecha de lanzamiento y fechas de uso.
- **Colecciones** que mezclan videojuegos, películas y series, con portada propia.
- **Modo «Seleccionar»** para enviar varios elementos a la papelera, eliminar varias colecciones o quitar varios elementos de una colección.
- **Papelera** con restauración, eliminación definitiva y «Vaciar papelera».
- **Español e inglés**, que cambian al momento, y **tema claro y oscuro**.
- **Fondos:** seis diseños incluidos y fondos importados, comunes a todos los perfiles, con desenfoque y atenuación ajustables.
- **Copias de seguridad** de un perfil en un `.zip`, y restauración como perfil nuevo o sobre el perfil abierto, con comprobación completa de la copia.
- La ventana se abre **como se cerró** (tamaño, posición, maximizada o en pantalla completa). **Pantalla completa** con F11 o con un botón.
- **Instalador** para Windows 10 y 11, por usuario y sin permisos de administrador, y **versión portable** en `.zip`, que guarda los datos junto al `.exe`.

### English

First published version.

#### Added

- Separate **profiles**, each with its own library, catalogs, collections and preferences. A backup is saved automatically before a profile is deleted.
- **Three libraries**, video games, movies and TV series, with a grid of covers that keep their proportions, lined up like books on a shelf. It works with libraries of thousands of items.
- **Item records** with alternate titles, description, release dates by region, platforms, genres, series, companies, people and their roles, countries of origin, rating with half stars, status, "Replayed" or "Rewatched", start and end dates to the day, month or year, hours played, seasons and episodes, physical or digital format, favorite, tags and notes.
- **Editable catalogs** (platforms, genres, series, companies, people, tags, regions and countries) with aliases, default lists in the profile's language and no broken references.
- **Cover, image gallery and PDF documents** for each item. Images can be optimized (WebP), keeping the original or not; thumbnails are generated and duplicates are never stored. PDFs open in the system viewer.
- **Search** by title, ignoring case and accents, **simple filters**, **advanced filters** with AND/OR groups, and **sorting** by title, date added, rating, release date and dates of use.
- **Collections** that mix video games, movies and TV series, with their own cover.
- **"Select" mode** to move several items to the trash, delete several collections or remove several items from a collection.
- **Trash** with restore, permanent deletion and "Empty trash".
- **Spanish and English**, switched instantly, and **light and dark themes**.
- **Backgrounds:** six built-in designs and imported backgrounds, common to every profile, with adjustable blur and dimming.
- **Backups** of a profile to a `.zip`, restored as a new profile or over the open one, with a full check of the backup.
- The window **opens as it was closed** (size, position, maximized or full screen). **Full screen** with F11 or a button.
- **Installer** for Windows 10 and 11, per user and with no administrator rights, and a **portable version** in a `.zip` that keeps its data next to the `.exe`.

[Unreleased]: https://github.com/Avelinares5803/KeepToMyShelf/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/Avelinares5803/KeepToMyShelf/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/Avelinares5803/KeepToMyShelf/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/Avelinares5803/KeepToMyShelf/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/Avelinares5803/KeepToMyShelf/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Avelinares5803/KeepToMyShelf/releases/tag/v1.0.0
