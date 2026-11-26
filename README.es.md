# KeepToMyShelf

[English](README.md) | **Español**

Aplicación de escritorio para organizar tu colección de **videojuegos, películas y series**: portadas, valoraciones, seguimiento, filtros, colecciones y perfiles independientes. Funciona sin conexión: todo se queda en tu equipo, sin cuentas y sin internet.

## Funciones

- **Perfiles:** cada persona tiene su propia biblioteca, sus catálogos, sus colecciones y sus preferencias.
- **Tres bibliotecas** (videojuegos, películas y series), que se muestran como una estantería de portadas del tamaño que elijas.
- **Fichas completas:** títulos alternativos, portada, galería de imágenes, documentos PDF (manuales, guías…), descripción, fechas de lanzamiento por región, plataformas, géneros, sagas, empresas, personas y su papel (dirección, reparto…), valoración con medias estrellas, estado, fechas de inicio y fin, horas jugadas, temporadas y capítulos, formato (físico o digital), favorito, etiquetas y notas.
- **Catálogos editables** de plataformas, géneros, empresas, personas, etiquetas… Empiezan con listas en tu idioma y nunca dejan referencias rotas. Se pueden fusionar los valores duplicados y copiar los catálogos de otro perfil.
- **Búsqueda y filtros:** búsqueda por título (sin distinguir mayúsculas ni tildes), filtros simples, filtros avanzados con Y/O, y ordenación.
- **Colecciones** que mezclan videojuegos, películas y series.
- **Imágenes gestionadas por la app:** copias optimizadas (WebP), con la opción de conservar el original, miniaturas y sin duplicados.
- **Español e inglés**, tema claro y oscuro, y fondos con desenfoque y atenuación ajustables.
- **Copias de seguridad:** guarda un perfil en un `.zip` y restáuralo como perfil nuevo o sobre el perfil abierto. Las copias programadas se guardan solas.
- **Exportar e importar:** saca los datos de la biblioteca a JSON, o cada tipo a CSV para hojas de cálculo, y trae a un perfil una biblioteca exportada en JSON o los elementos de un CSV.
- **Papelera:** los elementos eliminados se pueden recuperar.

## Descarga e instalación

KeepToMyShelf funciona en **Windows 10 y 11** (64 bits). Descárgala en la página de [Releases](https://github.com/Avelinares5803/KeepToMyShelf/releases). Hay dos opciones:

| Archivo                                | Cuándo elegirlo                                                                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `KeepToMyShelf-Setup-<versión>.exe`    | **Recomendado.** Instala la app para tu usuario, sin permisos de administrador, y crea los accesos directos.                                                                               |
| `KeepToMyShelf-Portable-<versión>.zip` | Sin instalar. Descomprímela donde quieras (también en una memoria USB) y abre `KeepToMyShelf\KeepToMyShelf.exe`. Tus datos se guardan en la carpeta `KeepToMyShelf Data`, junto al `.exe`. |

**«Windows protegió su PC»:** la aplicación no está firmada digitalmente, así que SmartScreen puede avisarte. Pulsa **Más información → Ejecutar de todas formas**.

**Comprobar la descarga (opcional):** en PowerShell, `Get-FileHash .\<archivo>` debe dar el mismo valor que aparece en el `SHA256SUMS.txt` del release.

## Tus datos

| Versión   | Dónde están los datos                                           |
| --------- | --------------------------------------------------------------- |
| Instalada | `%APPDATA%\KeepToMyShelf` (pégalo en el Explorador de archivos) |
| Portable  | `KeepToMyShelf Data`, junto a `KeepToMyShelf.exe`               |

- **Los archivos que añades se copian** a esa carpeta. Tus originales nunca se modifican, se mueven ni se borran.
- **Copias de seguridad:** en **Ajustes → Copias de seguridad**, «Crear copia de seguridad…» guarda el perfil abierto en un `.zip`. Guárdala en otro sitio (otro disco, la nube…). Para recuperarla, usa «Restaurar copia de seguridad…» en la pantalla de perfiles (como perfil nuevo) o «Restaurar copia sobre este perfil…» en Ajustes.
- **Copias programadas:** en **Ajustes → Copias de seguridad**, cada perfil elige nunca, cada día, cada semana (por defecto) o cada mes. La app guarda una en segundo plano al abrir el perfil, si toca y hay cambios, y conserva las 10 últimas de cada perfil. Incluyen las imágenes y los documentos, así que pueden ocupar mucho espacio, y se eliminan con el perfil.
- **Exportar:** en **Ajustes → Exportar**, se guardan los datos de la biblioteca en un JSON (con la papelera) o los elementos de un tipo en un CSV (sin ella). No incluye imágenes, documentos ni ajustes, así que no sustituye a una copia de seguridad.
- **Importar:** en **Ajustes → Importar**, «Importar desde JSON…» añade al perfil abierto una biblioteca exportada, de ese perfil o de otro. Antes muestra qué añadirá y pide confirmación. Solo añade lo que falta: los elementos y las colecciones que ya existen no se modifican. «Importar desde CSV…» añade los elementos del tipo elegido desde un CSV con las columnas de la exportación (solo «Título» es obligatoria). Si hay errores, se indican por fila y columna; las filas cuyo título ya existe se muestran, y por defecto se omiten.
- **Copias automáticas:** la app guarda una antes de eliminar un perfil, de restaurar una copia sobre él y de importar en él (conserva las 10 últimas). También copia cada base de datos antes de actualizar su formato.
- **Desinstalar nunca borra tus datos.** Si quieres borrarlos también, elimina la carpeta de arriba después de desinstalar.

## Actualizar

- **Instalada:** descarga y ejecuta el instalador de la versión nueva. Tus datos se conservan.
- **Portable:** descomprime la versión nueva y mueve a ella la carpeta `KeepToMyShelf Data` de la antigua, junto al `.exe` nuevo.

Una versión nueva puede actualizar el formato de tus datos la primera vez que los abre, después de guardar una copia de cada base de datos. **Una versión anterior no puede abrir los datos que una más nueva ha actualizado**, así que no vuelvas a una versión anterior sin una copia de seguridad hecha con ella.

## Problemas

- **La versión portable dice que no puede escribir en su carpeta:** muévela a una carpeta en la que puedas escribir, como Documentos o una memoria USB (no `Archivos de programa`).
- **Cualquier otro problema:** abre una [incidencia](https://github.com/Avelinares5803/KeepToMyShelf/issues) contando qué hiciste y qué pasó.

## Desarrollo

KeepToMyShelf está hecha con Electron, TypeScript, React y SQLite. Para trabajar en ella:

- [docs/DEVELOPMENT.es.md](docs/DEVELOPMENT.es.md): puesta en marcha, scripts, convenciones y cómo generar el instalador.
- [docs/ARCHITECTURE.es.md](docs/ARCHITECTURE.es.md): cómo está organizada la app.
- [docs/TESTING.es.md](docs/TESTING.es.md): estrategia de pruebas.
- [docs/GIT-WORKFLOW.es.md](docs/GIT-WORKFLOW.es.md) y [docs/RELEASING.es.md](docs/RELEASING.es.md): ramas, pull requests y publicación de versiones.
- [CHANGELOG.md](CHANGELOG.md): los cambios de cada versión.
- [docs/ROADMAP.md](docs/ROADMAP.md): estado del proyecto y decisiones acordadas; las decisiones de arquitectura están en [docs/adr/](docs/adr/) y la especificación original en [docs/SPECIFICATION.md](docs/SPECIFICATION.md).
- [CLAUDE.md](CLAUDE.md): cómo se trabaja con Claude Code en este proyecto.

## Licencia

[MIT](LICENSE)
