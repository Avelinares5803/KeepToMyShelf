# CLAUDE.md: cómo trabajar en KeepToMyShelf

Instrucciones para Claude Code. Se cargan automáticamente al empezar cada chat en esta carpeta.

## Al empezar un chat

1. Responde siempre **en español**. El responsable del proyecto conoce Python y JS/TS, pero **no Electron**: explica cada concepto de Electron que toques.
2. Lee [docs/ROADMAP.md](docs/ROADMAP.md) (estado, decisiones acordadas y decisiones abiertas) y los [ADR](docs/adr/) relacionados con la tarea. Para el detalle de los requisitos de la fase, consulta su sección en la especificación original, [docs/SPECIFICATION.md](docs/SPECIFICATION.md). Si contradice al ROADMAP o a los ADR, prevalecen estos.
3. Comprueba el estado del repositorio (`git status`, rama actual, `main` sincronizada con `origin/main`) antes de proponer nada.
4. Se trabaja **un chat por fase o subfase** (por ejemplo, un chat para la F6). Un chat nuevo no recuerda los anteriores: lo que no esté en el ROADMAP, los ADR o este archivo se pierde.

## Protocolo obligatorio

**Antes de implementar cada tarea**, explica el objetivo y el alcance, los archivos que vas a crear o modificar, las dependencias y los riesgos, y cómo se verificará. **Espera la aprobación** antes de empezar. Si hay varias opciones razonables, compáralas y recomienda una; no tomes decisiones importantes en silencio. Las preguntas de detalle visual pueden esperar a la implementación.

**Durante la implementación:**

- Respeta la arquitectura y las decisiones aprobadas.
- Limita los cambios a la tarea, sin reformatear ni tocar código ajeno.
- No añadas dependencias sin justificarlo y pedir permiso. Usa versiones con al menos 7 días de antigüedad.
- No ocultes errores con `catch` genéricos, valores por defecto injustificados o pruebas que no comprueben el comportamiento real.

**Al terminar**, ejecuta las comprobaciones (ver «Calidad»), revisa el código y los efectos secundarios, e informa de los archivos cambiados, las pruebas y sus resultados. Indica también qué no se pudo comprobar. No afirmes que algo funciona sin haberlo verificado. Propón el siguiente paso, pero **no avances a otra tarea sin aprobación**.

**Pide permiso explícito antes de:**

- instalar o actualizar dependencias;
- cambiar el esquema de la base de datos (migraciones);
- modificar archivos de configuración o los workflows de GitHub Actions;
- hacer **cada push**;
- cualquier operación remota en GitHub (borrar ramas, cambiar ajustes, etc.).

Los commits locales dentro de una tarea aprobada están permitidos.

**Nunca:**

- operaciones destructivas sin autorización;
- tocar los datos reales en `%APPDATA%\KeepToMyShelf`: las pruebas usan carpetas temporales mediante `KTMS_USER_DATA_DIR`;
- incluir credenciales, tokens o claves en el código, los commits o los registros;
- eludir las confirmaciones de permisos ni cambiar la configuración de permisos de Claude Code;
- crear agentes, generar tokens o instalar aplicaciones sin explicar antes el procedimiento.

## Flujo con Git y GitHub

- **Una rama y una PR por entrega:** `feat/…`, `fix/…`, `chore/…`, `docs/…`. Commits con [Conventional Commits](docs/GIT-WORKFLOW.md). Añade siempre este pie a los commits:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- `main` está protegida: exige una PR y la CI en verde (Verify Windows, Verify Linux y Package Windows). **El responsable crea la PR y hace el «Squash and merge» en la web de GitHub**, porque en este equipo no está instalada la CLI `gh`.
- Al pedir permiso para el push, da el **título Conventional Commit** para el «Squash and merge». Tras el push, da el enlace `https://github.com/Avelinares5803/KeepToMyShelf/pull/new/<rama>`.
- **Tras cada merge:**
  - sincroniza `main` (`git pull --ff-only`);
  - comprueba que `git diff main <rama>` está vacío;
  - borra la rama local (GitHub borra la remota sola).
  - Si cambiaron dependencias, ejecuta `npm ci` y pasa todas las pruebas.
- **Ramas apiladas:** antes de borrar la base, rebasa con `git rebase --onto main <sha-base-anterior> <rama>`.
- **Dependabot:** abre una PR semanal. Si `main` ha avanzado, el responsable comenta `@dependabot rebase` en la PR antes del merge.

## Al cerrar cada entrega (proceso de documentación)

1. Actualiza [docs/ROADMAP.md](docs/ROADMAP.md): estado de la fase, decisiones nuevas o cambiadas, decisiones abiertas y mejoras anotadas.
2. Si la decisión es de arquitectura, crea o actualiza su ADR en `docs/adr/`.
3. Incluye estos cambios en la misma rama de la entrega.
4. Cuando una fase termine, recomienda abrir un chat nuevo para la siguiente.

## Calidad: comprobaciones antes de cada push

```powershell
npm run lint; npm run typecheck; npx prettier --check .; npx vitest run; npm run build
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue; npx playwright test
```

- En cambios de interfaz, las E2E se ejecutan **tres veces seguidas** para detectar pruebas inestables.
- Para revisar el aspecto visual: un spec temporal de Playwright que saque capturas a la carpeta temporal y se borre antes del commit.
- En las E2E, busca por nombres accesibles exactos (`exact: true`): «EN» coincide con «Renombrar» si no.
- Toda prueba nueva debe fallar sin el cambio que verifica, siempre que sea razonable comprobarlo.

## Particularidades del entorno (Windows, PowerShell 5.1)

- VS Code define `ELECTRON_RUN_AS_NODE=1`. Elimínalo (`Remove-Item Env:ELECTRON_RUN_AS_NODE`) antes de `npm run dev` o Playwright; si no, Electron arranca como Node y no abre la ventana.
- PowerShell 5.1 no admite `&&`, y corta los argumentos con comillas dobles al pasarlos a programas nativos. Para mensajes de commit con comillas, escríbelos en un archivo y usa `git commit -F <archivo>`.
- No edites archivos con `Get-Content`/`Set-Content`, porque estropean las tildes (codificación ANSI). Usa las herramientas de edición de archivos.
- La ruta del usuario contiene «á». Los binarios nativos (better-sqlite3, sharp) son N-API precompilados: no se recompilan (`npmRebuild: false`).
- TypeScript 6, no 7, porque typescript-eslint aún no admite TypeScript 7.

## Convenciones del código

- **Capas:**
  - `src/core/`: reglas puras, sin Electron ni Node.
  - `src/shared/`: contratos IPC y tipos.
  - `src/main/`: servicios en `application/`, base de datos y archivos en `infrastructure/`, handlers finos en `ipc/`.
  - `src/preload/`: puente mínimo.
  - `src/renderer/`: React.
- **Preload:** solo puede importar _tipos_; una regla de ESLint lo impone. Los esquemas zod están en `shared/ipc-schemas.ts`, separados de `shared/ipc.ts`.
- **IPC:** cada llamada devuelve `IpcResult`. Los errores de dominio tienen un código `dominio.codigo`, con traducción obligatoria en `es.json` y `en.json`; una prueba lo comprueba.
- **Migraciones:** archivos SQL numerados, solo hacia delante. **Nunca se modifica una migración ya fusionada en `main`.** Cada migración necesita una prueba que migre datos de la versión anterior.
- **Listas iniciales** (`default-catalogs.ts`): se copian una vez por perfil. Añadir valores no los lleva a los perfiles existentes; un catálogo nuevo necesita su propia marca de carga. Los alias no deben ser redundantes; una prueba lo impone.
- **Interfaz:**
  - Todo texto visible va en los dos idiomas.
  - Los campos vacíos no se muestran en la ficha.
  - Toda acción destructiva pide confirmación, con el foco en «Cancelar».
