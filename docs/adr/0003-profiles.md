# ADR 0003: Perfiles, sesiones y preferencias

- **Estado:** aceptada
- **Fecha:** 2026-10-22

## Contexto

Cada perfil tiene su propia biblioteca, que nunca debe mezclarse con la de otro. Las preferencias (idioma, tema y, más adelante, fondo) tienen un valor global que cada perfil puede sobrescribir, y debe poder aplicarse un valor a todos los perfiles a la vez.

## Decisión

### Almacenamiento

```
%APPDATA%\KeepToMyShelf\
├─ app.db                    perfiles y preferencias
└─ profiles\<uuid>\library.db
```

- **Una base de datos por perfil**: el aislamiento es físico, no depende de filtrar cada consulta.
- La carpeta de un perfil se nombra con su UUID, no con su nombre. Cualquier nombre es válido, renombrar no mueve archivos y ningún identificador puede salir de la carpeta `profiles` (las rutas solo aceptan UUID).
- Los nombres de perfil se comparan sin mayúsculas, acentos ni espacios extra (`name_key UNIQUE`). Un nombre repetido recibe el sufijo libre más bajo: «Carlos (1)».

### Sesión única

- El proceso principal mantiene abierto un solo perfil (`SessionManager`) y entrega a la interfaz un **token de sesión**.
- Las operaciones sobre la biblioteca exigen el token. Uno de una sesión anterior se rechaza (`session.stale`), así que nunca se escribe en el perfil equivocado durante un cambio.
- Al abrir otro perfil, la base del anterior se cierra antes.

### Eliminación

- El perfil abierto no se puede eliminar (`profile.in_use`).
- La carpeta se renombra a `.deleted-<uuid>`, se borra el registro y después la carpeta. Si un archivo está bloqueado, la carpeta se elimina en el siguiente arranque. Nunca queda un perfil a medio borrar.

### Preferencias

- Resolución: valor del perfil → valor global → valor predeterminado (el idioma predeterminado sale del idioma del sistema).
- «Aplicar a todos los perfiles» guarda el valor global y borra los valores propios de esa preferencia en una sola transacción.
- Los valores se guardan como JSON y se validan con `zod` al leer y al escribir. Un valor almacenado corrupto se ignora con un aviso en la consola, para no impedir el arranque.

### Comunicación con la interfaz

- Toda llamada IPC devuelve `{ ok: true, value }` o `{ ok: false, error: { code, message } }`. Los errores esperados conservan su código traducible; los inesperados se registran en el proceso principal y llegan como `internal`.
- La entrada de cada canal se valida con `zod` en el proceso principal (`shared/ipc-schemas.ts`).
- El preload solo puede importar tipos de otros módulos, porque al estar aislado (`sandbox`) no puede cargar paquetes de npm. Una regla de ESLint lo impone.
