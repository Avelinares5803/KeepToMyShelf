> **Documento histórico.** Es la especificación original del proyecto, tal como la escribió su responsable el 2026-10-20, antes de empezar. Las decisiones tomadas después (que en algunos puntos la precisan o la cambian) están en [ROADMAP.md](ROADMAP.md) y en los [ADR](adr/), que prevalecen sobre este texto. El protocolo de trabajo vigente está en [CLAUDE.md](../CLAUDE.md); la sección 23 y la «regla final» solo aplicaban a la fase inicial de análisis.

# Proyecto: Aplicación de escritorio para organizar videojuegos, películas y series. El nombre es "KeepToMyShelf", tal y como pone en la carpeta del proyecto.

## 1. Tu papel y forma de trabajar

Actúa como un arquitecto de software y desarrollador senior con experiencia en aplicaciones de escritorio, diseño de bases de datos, testing automatizado, clean code, modularidad, Git, GitHub y DevOps.

Quiero que me acompañes durante todo el ciclo de vida del proyecto, desde la definición de requisitos y el diseño de la arquitectura hasta la implementación, las pruebas, la distribución de la aplicación y su mantenimiento.

Debes priorizar:

- Código limpio, legible, modular y reutilizable.
- Arquitectura sencilla de mantener y ampliar, sin complejidad innecesaria.
- Testing desde las primeras fases del desarrollo.
- Separación de responsabilidades y bajo acoplamiento.
- Seguridad e integridad de los datos del usuario.
- Buen rendimiento incluso cuando la biblioteca contenga muchos elementos y archivos multimedia.
- Una interfaz moderna, coherente, intuitiva y visualmente cuidada.
- Decisiones técnicas justificadas y adecuadas para un proyecto individual que pueda evolucionar en el futuro.

No quiero que escribas código por escribirlo ni que introduzcas patrones de diseño innecesarios. Justifica las decisiones importantes y explica brevemente las alternativas relevantes.

Soy el responsable del proyecto y quiero entender las decisiones que tomemos. Explícame los conceptos técnicos que sean importantes sin dar por hecho que conozco todas las herramientas o tecnologías.

## 2. Protocolo de trabajo obligatorio

### Fase inicial: análisis y planificación

En esta primera fase, NO debes modificar, crear, eliminar ni sobrescribir archivos del proyecto. Tampoco debes ejecutar comandos que alteren el repositorio, instalar dependencias o generar código.

Primero, analiza la descripción completa que te proporcionaré y, si tienes acceso a un repositorio existente, inspecciona su estructura y configuración en modo de solo lectura.

A continuación:

1. Identifica los requisitos funcionales y no funcionales.
2. Detecta ambigüedades, contradicciones, requisitos incompletos y posibles problemas de diseño.
3. Hazme las preguntas necesarias para resolver las decisiones que afecten significativamente a la arquitectura o al funcionamiento de la aplicación.
4. Compara las tecnologías adecuadas y recomienda una combinación concreta.
5. Propón la arquitectura, la estructura de carpetas, el modelo de datos y la estrategia de almacenamiento.
6. Divide el proyecto en fases pequeñas, ordenadas por dependencias y prioridad.
7. Define una estrategia de testing, control de versiones, integración continua y distribución.
8. Identifica los riesgos técnicos más importantes y cómo prevenirlos.

No es necesario preguntarme por cada detalle visual desde el principio. Distingue entre decisiones arquitectónicas que deben resolverse ahora y detalles de interfaz que podemos decidir durante la implementación.

Cuando existan varias opciones razonables, explica sus ventajas e inconvenientes y formula una recomendación. No tomes decisiones importantes en silencio.

No comiences la implementación hasta que hayamos revisado el análisis y aprobado el plan.

### Fases posteriores: implementación controlada

Una vez aprobado el plan, trabajaremos paso a paso.

Antes de implementar cada tarea:

- Explica el objetivo y el alcance.
- Indica los archivos que esperas crear o modificar.
- Señala las dependencias y los posibles riesgos.
- Define cómo verificaremos que el resultado funciona.

Durante la implementación:

- Respeta la arquitectura, las convenciones y las decisiones aprobadas.
- Limita los cambios a los archivos necesarios para la tarea.
- No introduzcas dependencias nuevas sin justificar su necesidad.
- No elimines, sobrescribas ni reformatees código ajeno a la tarea sin consultarme.
- No cambies contratos, esquemas de datos o interfaces públicas sin evaluar el impacto.
- No ocultes errores mediante excepciones genéricas, valores por defecto injustificados o pruebas que no comprueben el comportamiento real.

Al terminar cada tarea:

- Ejecuta las pruebas pertinentes que estén disponibles y autorizadas.
- Comprueba el funcionamiento y los posibles efectos secundarios.
- Revisa el código para detectar duplicación, errores y problemas de diseño.
- Informa de los archivos modificados, las pruebas ejecutadas y sus resultados.
- Indica claramente cualquier prueba que no se haya podido ejecutar.
- Propón el siguiente paso, pero no avances automáticamente a una tarea independiente que requiera mi revisión.

No afirmes que algo funciona si no lo has verificado.

### Permisos y seguridad

Trabaja con el principio de mínimo privilegio.

No ejecutes operaciones destructivas, no elimines datos del usuario, no sobrescribas configuraciones importantes ni realices operaciones remotas en GitHub sin mi autorización explícita.

Antes de instalar dependencias, modificar archivos de configuración, ejecutar migraciones, cambiar el esquema de la base de datos, realizar commits, hacer push o alterar la configuración de GitHub Actions, explica qué vas a hacer y solicita permiso cuando corresponda.

Respeta los permisos configurados en Claude Code. No intentes eludir las confirmaciones ni cambies la configuración de permisos por tu cuenta.

Nunca incluyas tokens, contraseñas, claves privadas o credenciales en el código, los commits, los registros o los archivos versionados.

## 3. Descripción general del producto

Quiero desarrollar una aplicación de escritorio para Windows que permita almacenar, organizar, consultar, filtrar y valorar información sobre videojuegos, películas y series.

El usuario podrá crear su propia biblioteca personal e introducir manualmente los datos de cada elemento. La aplicación también permitirá adjuntar imágenes y documentos, mantener diferentes perfiles y crear colecciones personalizadas.

El objetivo inicial es Windows 10 y Windows 11. La compatibilidad con Linux y macOS podría añadirse en el futuro, por lo que conviene evitar decisiones que la dificulten innecesariamente.

La aplicación debe funcionar de forma fiable como programa de escritorio, almacenar los datos localmente y ser distribuible mediante una versión instalable o ejecutable adecuada para Windows.

No presupongas que debe utilizar una arquitectura cliente-servidor ni que necesita conexión a Internet. Evalúa si una aplicación local sin servidor es suficiente para los requisitos.

## 4. Tecnologías: comparar antes de elegir

El lenguaje puede ser Python o JavaScript/TypeScript. No he decidido todavía cuál utilizar. Esos son los que entiendo más o menos, pero si se te ocurre uno más adecuado, adelante.

Compara al menos estas alternativas cuando sean pertinentes:

- Python con una tecnología adecuada para interfaces de escritorio.
- JavaScript o TypeScript con Electron.
- JavaScript o TypeScript con Tauri, si sus ventajas justifican la complejidad adicional.

Puedes proponer otra alternativa si está claramente mejor justificada.

Evalúa:

- Facilidad de desarrollo y mantenimiento.
- Calidad y flexibilidad de la interfaz.
- Rendimiento y consumo de memoria.
- Facilidad para crear instaladores y distribuir actualizaciones.
- Integración con el sistema de archivos y las funciones de Windows.
- Soporte para imágenes, PDF y otros archivos multimedia.
- Madurez de las herramientas de testing.
- Ecosistema, documentación y mantenimiento de las dependencias.
- Posibilidad realista de incorporar Linux y macOS en el futuro.
- Complejidad para un desarrollador que trabaja principalmente en solitario.

No elijas TypeScript, Python, Electron, Tauri ni ninguna otra tecnología simplemente porque sea popular. Relaciona la recomendación con las necesidades reales de esta aplicación.

## 5. Perfiles de usuario

Al iniciar la aplicación, el usuario deberá elegir un perfil.

Si todavía no existen perfiles, podrá crear uno introduciendo únicamente un nombre.

Cada perfil tendrá su propia biblioteca y sus propios datos, preferencias, valoraciones, estados de seguimiento, etiquetas y colecciones, salvo que exista una razón técnica importante para proponer otra separación.

Estudia cómo aislar los datos de cada perfil para evitar que se mezclen accidentalmente.

Propón un mecanismo para:

- Crear perfiles.
- Seleccionar un perfil.
- Volver a la selección de perfiles.
- Cambiar de perfil de forma segura.
- Gestionar nombres duplicados y nombres no válidos.
- Evitar la pérdida de datos al cambiar de perfil.

No es necesario implementar cuentas en línea, autenticación remota ni sincronización en la nube en la primera versión.

## 6. Idiomas, apariencia y navegación

La aplicación debe estar disponible en español e inglés.

El idioma se podrá cambiar en cualquier momento mediante un control discreto y accesible, preferiblemente situado en la zona superior de la interfaz.

Evalúa si el cambio de idioma puede aplicarse en tiempo real o si resulta técnicamente necesario reiniciar la aplicación. Explica las implicaciones y recomienda la experiencia más cómoda.

No quiero dos ejecutables independientes únicamente por el idioma si existe una alternativa razonable que permita seleccionar el idioma dentro de la aplicación.

También quiero estudiar estas opciones de personalización:

- Modo claro y modo oscuro.
- Volver a la selección de perfiles.
- Volver a la selección del modo de contenido.
- Volver a la pantalla anterior.
- Seleccionar una imagen de fondo.
- Ajustar el desenfoque o difuminación del fondo.
- Elegir entre varios fondos predeterminados.
- Importar imágenes propias para utilizarlas como fondo.

Los controles deben estar organizados de forma discreta y coherente, sin saturar la interfaz.

Propón una estrategia de persistencia de las preferencias, diferenciando las preferencias generales de la aplicación de las preferencias específicas de cada perfil cuando corresponda.

## 7. Modos de contenido

Después de seleccionar un perfil, aparecerá una pantalla que permitirá elegir uno de estos tres modos:

1. Videojuegos.
2. Películas.
3. Series.

Cada modo tendrá su propia biblioteca, sus filtros y sus atributos específicos.

La navegación deberá permitir regresar a la selección del modo y cambiar de perfil sin perder datos ni provocar estados inconsistentes.

## 8. Bibliotecas y gestión de elementos

Cada modo mostrará una biblioteca visual de los elementos correspondientes.

El usuario podrá:

- Añadir un elemento.
- Consultar sus detalles.
- Editar sus atributos.
- Eliminarlo.
- Buscarlo por nombre.
- Filtrarlo por distintos atributos.
- Ordenar los resultados.
- Abrir los documentos e imágenes asociados cuando corresponda.

La interfaz exacta de creación, edición y eliminación se decidirá posteriormente.

### Creación de elementos

El título será el principal dato identificativo visible.

Si el usuario crea un elemento sin proporcionar un nombre, se le asignará automáticamente un nombre provisional, por ejemplo, «Sin nombre 1».

Diseña un sistema que evite colisiones innecesarias entre nombres provisionales, incluso después de eliminar elementos o cerrar y volver a abrir la aplicación.

Evalúa si conviene distinguir entre un identificador interno único y el título visible, para permitir títulos duplicados sin generar problemas de integridad.

### Vista de biblioteca

Los elementos se mostrarán en una cuadrícula o distribución visual apropiada.

Cuando tengan portada, se mostrará la imagen y el título debajo, con una presentación discreta que dé protagonismo a la imagen.

Cuando no tengan portada, se mostrará el título sin una imagen ficticia obligatoria.

La distribución deberá adaptarse al tamaño de la ventana y admitir bibliotecas grandes sin cargar todas las imágenes originales a máxima resolución.

### Vista de detalle

Al seleccionar un elemento, se mostrará una pantalla con sus datos disponibles.

Los atributos opcionales que no tengan contenido no deben aparecer como campos vacíos en la vista de consulta.

La pantalla tendrá un botón de edición, que puede representarse mediante un icono de lápiz.

La edición permitirá modificar los atributos sin tener que rellenarlos todos.

### Eliminación

El mecanismo de eliminación se definirá posteriormente, pero debe prevenir eliminaciones accidentales.

Analiza cómo gestionar la eliminación de un elemento que también pertenezca a una o varias colecciones.

## 9. Búsqueda, filtros y ordenación

Cada biblioteca tendrá una barra de búsqueda para localizar elementos por título.

También deberá permitir filtrar por los atributos correspondientes al tipo de contenido.

El sistema debe admitir condiciones AND y OR, por ejemplo:

- Género = RPG AND Plataforma = PC.
- Género = RPG OR Género = Acción.
- Estado = Terminado AND Etiqueta = Romhack.

Diseña una solución extensible que permita incorporar nuevos atributos y filtros sin tener que reescribir todo el sistema de búsqueda.

Analiza cómo representar grupos de condiciones y su combinación lógica.

Considera también:

- Búsqueda por títulos alternativos.
- Diferencias entre mayúsculas y minúsculas.
- Tratamiento razonable de acentos.
- Búsquedas parciales.
- Combinación de búsqueda textual y filtros.
- Ordenación por título, fecha, valoración u otros campos pertinentes.
- Rendimiento con miles de elementos.

La interfaz para construir filtros complejos se puede decidir durante el diseño de la experiencia de usuario.

## 10. Atributos de los videojuegos

Los videojuegos podrán tener los siguientes atributos:

1. Título.
2. Títulos alternativos: para nombres diferentes en otras regiones o versiones.
3. Portada: imagen importada desde el equipo del usuario.
4. Multimedia: imágenes adicionales, arte promocional, manuales, guías y documentos PDF.
5. Descripción.
6. Fechas de lanzamiento en distintas regiones.
7. Plataformas: consolas y ordenadores.
8. Géneros: acción, RPG, disparos y otros.
9. Saga o franquicia.
10. Desarrolladoras.
11. Distribuidoras.
12. Compositores.
13. Valoración personal.
14. Estado de seguimiento.
15. Fechas de juego.
16. Etiquetas y categorías personalizadas.
17. Formato de adquisición o disponibilidad: físico, digital o ambos.

### Reglas para los atributos de videojuegos

**Títulos alternativos:** un videojuego puede tener varios títulos alternativos.

**Portada y multimedia:** el usuario seleccionará archivos de su equipo. Evalúa la compresión de imágenes, las miniaturas, los formatos compatibles y la posibilidad de preservar los originales cuando sea necesario.

**Fechas de lanzamiento:** se podrán registrar fechas correspondientes a distintas regiones. No presupongas que todos los juegos tienen una única fecha global.

**Plataformas:** proporciona una lista inicial razonable y permite que el usuario añada, modifique o elimine plataformas personalizadas.

**Géneros:** incluye una lista inicial editable por el usuario.

**Sagas, desarrolladoras, distribuidoras y compositores:** deben poder gestionarse mediante entidades reutilizables, permitiendo crear, editar y eliminar sus registros. Un mismo registro podrá asociarse a varios videojuegos.

Ten en cuenta que una misma empresa puede desempeñar tanto la función de desarrolladora como la de distribuidora.

**Valoración:** prefiero inicialmente un sistema de estrellas, aunque el número de estrellas, su granularidad y la posibilidad de dejar un elemento sin valorar deben decidirse posteriormente.

**Estado:** las opciones iniciales serán:

- Por empezar.
- Por terminar.
- Terminado.
- Abandonado.

**Fechas de juego:** deben permitir registrar una fecha de comienzo y otra de finalización.

Cada fecha podrá tener uno de estos niveles de precisión:

- Día, mes y año: DD/MM/AAAA.
- Mes y año: MM/AAAA.
- Solo año: AAAA.

Debe ser posible registrar únicamente una de las dos fechas.

Si las fechas de comienzo y finalización representan el mismo día exacto, la vista de detalle mostrará una única fecha en lugar de repetirla. En otros casos, mostrará las fechas disponibles por separado.

No inventes componentes de fecha que no se hayan proporcionado.

**Etiquetas personalizadas:** el usuario podrá crear etiquetas como «Romhack», «Traducción por fans» o «Difícil». Se podrán asociar varias etiquetas al mismo juego.

**Formato:** se podrá seleccionar físico, digital o ambos.

Todos los atributos anteriores serán opcionales, excepto el mecanismo interno que garantice que cada elemento tenga una identidad única. El nombre provisional permitirá crear un registro sin título.

## 11. Atributos de las películas

Las películas podrán tener:

1. Título.
2. Títulos alternativos.
3. Portada.
4. Descripción.
5. Productoras.
6. Saga o franquicia.
7. Fechas de estreno en distintas regiones.
8. Géneros.
9. Director o directores.
10. Compositor o compositores.
11. Estado de seguimiento.
12. Valoración personal.
13. Actores.
14. Fechas de visionado.
15. Formato físico, digital o ambos.

Los atributos opcionales deben comportarse de forma coherente con los de videojuegos.

Las productoras, sagas, géneros, directores, compositores y actores deben modelarse de manera que puedan reutilizarse y asociarse a múltiples películas cuando corresponda.

El estado inicial tendrá estas opciones:

- Por empezar.
- Por terminar.
- Terminada.
- Abandonada.

Las fechas de visionado tendrán fecha de comienzo y fecha de finalización, con precisión de día, mes o año.

Si ambas fechas representan el mismo día exacto, se mostrará una única fecha en la vista de detalle.

Si solo se ha introducido una, se mostrará exclusivamente esa fecha.

No es obligatorio que las fechas sean completas ni que todas las películas tengan una fecha de visionado.

## 12. Atributos de las series

Las series tendrán los atributos de las películas y dos atributos adicionales:

1. Número de capítulos.
2. Número de temporadas.

Evalúa si estos dos datos deberían ser valores generales de la serie o si convendría permitir registrar información más detallada por temporada en una futura versión.

No implementes un sistema de seguimiento por episodio o temporada sin justificarlo primero, ya que no forma parte de los requisitos iniciales.

## 13. Gestión de atributos y listas personalizadas

Quiero poder personalizar los catálogos que utiliza la aplicación.

Por ejemplo:

- Plataformas.
- Géneros.
- Sagas.
- Desarrolladoras.
- Distribuidoras.
- Compositores.
- Productoras.
- Directores.
- Actores.
- Etiquetas.

El usuario deberá poder añadir, modificar y eliminar los valores correspondientes.

No todos los catálogos tienen que compartir el mismo comportamiento. Analiza cuáles deben ser listas de valores predefinidos y cuáles deberían ser entidades independientes.

Propón reglas de integridad para evitar referencias rotas cuando se modifique o elimine un valor que ya esté asociado a elementos existentes.

Quiero evitar tanto los límites artificiales como el crecimiento descontrolado de los datos.

Evalúa si conviene establecer límites configurables de aproximadamente 50 valores por categoría, distinguiendo entre listas de valores únicos y relaciones en las que puede haber múltiples asociaciones.

No impongas ese límite sin analizar antes sus consecuencias.

## 14. Colecciones personalizadas

La aplicación permitirá crear colecciones que contengan elementos de la biblioteca.

Cada colección tendrá:

- Nombre.
- Portada opcional y modificable.
- Lista de elementos seleccionados manualmente.

Ejemplos:

- Juegos favoritos.
- Películas pendientes.
- RPG que quiero completar.
- Series que quiero recomendar.

El usuario podrá añadir a una colección elementos que ya existan en su biblioteca y gestionar sus pertenencias posteriormente.

Analiza si conviene permitir colecciones mixtas con videojuegos, películas y series, o mantenerlas separadas. Justifica la recomendación según los requisitos y la experiencia de uso.

La pertenencia a una colección no debe duplicar los registros originales de los elementos.

Si se elimina un elemento de una biblioteca, las colecciones deben seguir siendo consistentes.

## 15. Imágenes y archivos multimedia

La aplicación gestionará archivos seleccionados desde el ordenador.

Debes proponer una estrategia de almacenamiento que contemple:

- Portadas.
- Imágenes adicionales.
- Fondos personalizados.
- Manuales y guías en PDF.
- Miniaturas para las vistas de biblioteca.
- Compresión de imágenes cuando sea apropiada.
- Prevención de archivos duplicados cuando sea razonable.
- Validación de tipos de archivo y tamaños.
- Manejo de rutas inválidas o archivos que hayan sido movidos o eliminados externamente.
- Copias de seguridad y restauración de datos.

Compara almacenar los archivos dentro de una estructura de carpetas administrada por la aplicación con almacenar referencias a sus ubicaciones originales.

La aplicación debería seguir funcionando si el usuario mueve o cambia de nombre los archivos originales, siempre que los archivos importados se hayan copiado a un almacenamiento administrado por ella.

No sobrescribas los originales importados sin autorización.

Evalúa el uso de miniaturas y cachés para evitar cargar repetidamente imágenes grandes.

## 16. Persistencia y modelo de datos

La aplicación deberá guardar los datos de forma persistente entre ejecuciones.

Compara las opciones adecuadas para una aplicación local, incluyendo SQLite si encaja con la arquitectura recomendada.

Propón un modelo de datos que contemple:

- Perfiles.
- Elementos de cada tipo.
- Títulos alternativos.
- Fechas con distintos niveles de precisión.
- Relaciones entre elementos y géneros.
- Relaciones entre elementos y personas o empresas.
- Plataformas y formatos.
- Etiquetas.
- Colecciones.
- Archivos multimedia.
- Preferencias de aplicación y de perfil.

Evita duplicar estructuras y lógica entre videojuegos, películas y series, pero no fuerces todos sus atributos a una estructura genérica difícil de validar.

Explica qué entidades compartirán tablas, cuáles tendrán tablas específicas y cómo se representarán las relaciones muchos-a-muchos.

Incluye una estrategia de migraciones de base de datos, transacciones, restricciones de integridad, gestión de errores y copias de seguridad.

## 17. Interfaz y experiencia de usuario

La interfaz debe ser moderna, clara y consistente.

Prioriza:

- Navegación predecible.
- Jerarquía visual adecuada.
- Cuadrículas de portadas.
- Vistas de detalle bien organizadas.
- Formularios de edición cómodos.
- Controles discretos para idioma, tema y navegación.
- Adaptación a diferentes tamaños de ventana.
- Accesibilidad básica.
- Mensajes de error comprensibles.
- Confirmaciones cuando una operación pueda provocar pérdida de datos.

No es necesario cerrar ahora todos los detalles visuales.

Propón una organización de pantallas y un flujo de navegación antes de elegir componentes visuales concretos.

## 18. Testing y calidad del código

El testing es uno de los requisitos centrales del proyecto.

Diseña una estrategia que incluya, cuando resulte pertinente:

- Pruebas unitarias.
- Pruebas de integración.
- Pruebas de la base de datos.
- Pruebas de los servicios de aplicación.
- Pruebas de los filtros y combinaciones AND/OR.
- Pruebas de las reglas de fechas.
- Pruebas de aislamiento entre perfiles.
- Pruebas de gestión de archivos e imágenes.
- Pruebas de colecciones y relaciones.
- Pruebas de interfaz.
- Pruebas de regresión.
- Pruebas de empaquetado y distribución.

Selecciona las herramientas de testing en función de la tecnología finalmente elegida.

Aplica buenas prácticas de clean code:

- Funciones y clases con responsabilidades claras.
- Nombres descriptivos.
- Evitar duplicación innecesaria.
- Separación entre interfaz, lógica de negocio y persistencia.
- Manejo explícito de errores.
- Tipado cuando resulte apropiado.
- Dependencias controladas.
- Pruebas deterministas.
- Refactorización respaldada por pruebas.

No persigas una cobertura del 100 % como objetivo aislado. Prioriza las reglas de negocio, los casos límite y las funcionalidades que puedan provocar pérdida o corrupción de datos.

Propón métricas de calidad realistas, como cobertura de código en módulos críticos, análisis estático y comprobaciones automatizadas.

## 19. Git, GitHub y DevOps

Quiero aprender a gestionar correctamente el desarrollo con GitHub y aplicar prácticas DevOps desde el principio.

Mi cuenta de GitHub es:

https://github.com/Avelinares5803

No presupongas que existe un repositorio específico para este proyecto ni que tienes permisos para modificar mi cuenta. Primero, comprueba qué información está disponible y pídeme el enlace del repositorio si es necesario.

Quiero que me expliques y ayudes a preparar:

### Control de versiones

- Inicialización del repositorio si todavía no existe.
- Estructura de ramas adecuada para un desarrollador individual.
- Uso de commits pequeños, descriptivos y coherentes.
- Convenciones de mensajes de commit.
- Gestión de ramas de funcionalidades y correcciones.
- Uso de pull requests cuando aporte valor.
- Protección de la rama principal si resulta adecuada.

### GitHub Actions e integración continua

- Ejecución automática de pruebas.
- Comprobación del estilo y la calidad del código.
- Análisis estático y comprobaciones de tipos cuando corresponda.
- Validación de las compilaciones.
- Estrategia de caché de dependencias cuando aporte beneficios.
- Ejecución de pruebas en Windows y, si es viable, Linux.

### Releases y distribución

- Generación automatizada de versiones instalables para Windows.
- Creación de releases en GitHub.
- Versionado semántico cuando sea adecuado.
- Registro de cambios.
- Pruebas de los artefactos generados.
- Gestión segura de las versiones publicadas.

### Agentes de GitHub y automatización

Explícame qué significa crear o configurar un agente de GitHub en este contexto.

Compara las opciones que realmente encajen con un proyecto individual, como GitHub Copilot, GitHub Actions, Dependabot y agentes de programación compatibles con GitHub, sin confundir sus funciones.

Quiero entender qué herramientas sirven para programar, cuáles automatizan tareas y cuáles ayudan a revisar o integrar cambios.

Indica qué opciones son gratuitas, cuáles tienen límites de uso y cuáles requieren planes o permisos adicionales, verificando la información actual cuando sea necesario.

No instales aplicaciones, no crees agentes, no concedas permisos, no generes tokens y no modifiques la configuración de GitHub sin explicarme antes el procedimiento y obtener mi autorización.

### Documentación del proyecto

Propón una documentación mínima pero útil:

- README.
- Instrucciones de instalación y ejecución.
- Guía de desarrollo.
- Arquitectura.
- Estrategia de testing.
- Procedimiento de compilación.
- Flujo de trabajo con Git.
- Procedimiento de publicación de versiones.

## 20. Distribución y mantenimiento

La primera versión deberá poder utilizarse en Windows 10 y Windows 11.

Evalúa:

- Empaquetado de la aplicación.
- Instalador frente a ejecutable portable.
- Dependencias necesarias en el equipo del usuario.
- Ubicación de la base de datos y los archivos multimedia.
- Permisos de escritura.
- Actualizaciones futuras.
- Migraciones de datos.
- Compatibilidad con distintas resoluciones y escalados de pantalla.
- Recuperación ante fallos.
- Copias de seguridad y restauración.

Considera la futura compatibilidad con Linux y macOS, pero no añadas complejidad ni costes innecesarios a la primera versión.

## 21. Posibles mejoras futuras

Puedes identificar oportunidades para ampliar la aplicación en el futuro, por ejemplo:

- Exportación e importación de bibliotecas.
- Copias de seguridad automatizadas.
- Sincronización entre dispositivos.
- Integración opcional con APIs externas de videojuegos y cine.
- Importación masiva de datos.
- Estadísticas personales.
- Seguimiento más detallado de series.
- Plugins o extensiones.

Estas posibilidades no forman parte automáticamente de la primera versión. Clasifícalas como mejoras futuras y no las incluyas en el alcance inicial sin mi aprobación.

## 22. Límites y decisiones pendientes

El orden de los atributos que he descrito no es definitivo. Puedes recomendar otro orden atendiendo a la experiencia de usuario.

Los detalles de los botones, la edición y eliminación, el diseño exacto de los formularios y otros aspectos visuales se decidirán más adelante.

Puedes sugerir atributos que falten, pero distingue claramente entre los requisitos que he solicitado y tus propuestas adicionales.

No implementes automáticamente todas las ideas posibles. La prioridad es construir una primera versión completa, estable y mantenible, con una arquitectura que permita ampliarla sin tener que rehacerla.

## 23. Resultado esperado de la primera fase

En tu primera respuesta, quiero recibir:

1. Un resumen del proyecto y su objetivo.
2. Una lista estructurada de requisitos funcionales y no funcionales.
3. Las principales ambigüedades y decisiones que debemos resolver.
4. Las preguntas imprescindibles que necesitas hacerme, agrupadas por tema y priorizadas.
5. Una comparación razonada de las tecnologías candidatas.
6. Tu recomendación tecnológica inicial, explicando sus ventajas e inconvenientes.
7. Una propuesta preliminar de arquitectura y modelo de datos.
8. Una propuesta de estructura de carpetas.
9. Un plan de desarrollo dividido en fases y tareas.
10. Una estrategia de testing.
11. Un plan inicial de GitHub, CI/CD, DevOps y distribución.
12. Una lista de riesgos técnicos y medidas preventivas.
13. Una propuesta de alcance para la primera versión y otra lista de mejoras futuras.

Distingue entre decisiones que ya están respaldadas por mis requisitos y decisiones que siguen pendientes de aprobación.

Si necesitas hacer preguntas, prioriza las que cambien la arquitectura, el almacenamiento, la seguridad o el alcance. No me hagas decenas de preguntas sobre detalles visuales que podamos decidir más adelante.

Puedes presentar una recomendación provisional antes de que responda a todas las preguntas, siempre que identifiques claramente las suposiciones realizadas.

**Regla final: en esta primera fase, analiza, investiga si es necesario y planifica. No escribas código ni modifiques el proyecto. Espera a que revise y apruebe el plan antes de comenzar la implementación.**
