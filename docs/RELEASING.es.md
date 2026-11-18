# Publicar una versión

[English](RELEASING.md) | **Español**

Cada versión se publica en [GitHub Releases](https://github.com/Avelinares5803/KeepToMyShelf/releases) con dos archivos para Windows y sus checksums. El workflow [`release.yml`](../.github/workflows/release.yml) los genera y los prueba al subir una etiqueta de versión, y deja un **borrador**. Nada se publica sin que lo revises.

Los detalles técnicos están en el [ADR 0010](adr/0010-distribution.md).

## Versiones

Se sigue [SemVer](https://semver.org/lang/es/): `MAYOR.MENOR.PARCHE`.

- **PARCHE** (1.0.1): correcciones.
- **MENOR** (1.1.0): funciones nuevas que no rompen nada.
- **MAYOR** (2.0.0): cambios que obligan al usuario a hacer algo (por ejemplo, una copia de seguridad que la versión anterior ya no puede abrir).
- **Versión candidata** (`1.1.0-rc.1`): para probar el workflow o una versión antes de publicarla. GitHub la marca como _pre-release_.

## Qué genera el workflow

| Archivo                          | Para quién                                                               |
| -------------------------------- | ------------------------------------------------------------------------ |
| `KeepToMyShelf-Setup-<v>.exe`    | Instalador NSIS por usuario, sin permisos de administrador               |
| `KeepToMyShelf-Portable-<v>.zip` | Versión portable: los datos van en `KeepToMyShelf Data`, junto al `.exe` |
| `SHA256SUMS.txt`                 | Los SHA-256 de los dos, en el formato de `sha256sum -c`                  |

Antes de crear el borrador, el workflow:

1. Comprueba que la etiqueta coincide con la versión de `package.json` (`v1.0.0` ↔ `1.0.0`).
2. Pasa las mismas comprobaciones que la CI, con las pruebas E2E.
3. Empaqueta la app y hace la **prueba de humo** (`npm run test:smoke`): instala el instalador en silencio en una carpeta temporal, abre la app instalada, crea un perfil, comprueba dónde guarda los datos y que el `.exe` no se puede usar como Node, y la desinstala. Después hace lo mismo con el zip portable.

Si algo falla, no se crea ningún borrador. Las trazas de las pruebas quedan como artefacto `test-traces` en la ejecución del workflow (pestaña **Actions**).

## Paso a paso

### 1. Preparar la versión (en una PR)

En una rama `chore/release-<versión>`:

1. Cambia la versión sin crear ninguna etiqueta:

   ```powershell
   npm version 1.1.0 --no-git-tag-version
   ```

   Actualiza `package.json` y `package-lock.json`.

2. En `CHANGELOG.md`, convierte «Unreleased» en la sección de la versión, con la fecha (`## [1.1.0] - 2027-01-15`), y añade encima una sección «Unreleased» vacía. Cada versión tiene dos bloques, «Español» e «English», en el mismo orden que la plantilla del release.
3. Pasa las comprobaciones de [DEVELOPMENT.es.md](DEVELOPMENT.es.md#antes-de-cada-push) y, si quieres probar los archivos en tu equipo:

   ```powershell
   npm run package; npm run test:smoke
   ```

   La prueba de humo se niega a empezar si KeepToMyShelf ya está instalado en tu usuario, porque el instalador sustituiría esa instalación.

4. Haz la PR y, con la CI en verde, el «Squash and merge»: `chore(release): 1.1.0`.

### 2. Crear la etiqueta

Sobre el `main` actualizado:

```powershell
git switch main
git pull --ff-only
git tag -a v1.1.0 -m "KeepToMyShelf 1.1.0"
git push origin v1.1.0
```

### 3. Revisar el borrador

1. En la pestaña **Actions**, espera a que termine el workflow **Release** (unos 15 minutos).
2. En **Releases** aparece el borrador «KeepToMyShelf 1.1.0» con los tres archivos. En una versión candidata, GitHub no muestra la marca _Pre-release_ mientras es un borrador: aparece al publicarlo. Para comprobarla antes, pulsa **Edit** y mira la casilla «Set as a pre-release».
3. Pulsa **Edit** y añade los cambios de la versión desde `CHANGELOG.md`: sustituye el comentario bajo «Español» por el bloque «Español», y el que está bajo «English» por el bloque «English», cada uno sin su título (`### Español`, `### English`) y sin las líneas de enlaces del final del archivo (`[1.1.0]: https://…`). El resto del texto sale de la plantilla [`.github/release-notes.md`](../.github/release-notes.md), con la versión ya puesta por el workflow.
4. Si quieres, descarga los archivos y pruébalos.
5. Pulsa **Publish release**.

## Si algo sale mal

- **El workflow falla:** corrige el problema en una PR y crea una etiqueta nueva (`v1.1.0-rc.2`, o `v1.1.1` si ya se había publicado). **Nunca muevas una etiqueta ya subida**: alguien podría haber descargado lo que apuntaba.
- **La etiqueta no coincide con la versión:** bórrala y créala de nuevo. Es seguro porque el workflow no ha creado nada:

  ```powershell
  git push origin :refs/tags/v1.1.0
  git tag -d v1.1.0
  ```

- **Descartar un borrador o una versión candidata:** borra el release en GitHub (**Delete**) y después la etiqueta, con los mismos dos comandos.

## Seguridad

- El trabajo que compila y prueba solo puede leer el repositorio. Solo el que crea el borrador tiene permiso de escritura (`contents: write`).
- El borrador lo crea la CLI `gh` del propio equipo de GitHub, con el token temporal del workflow: sin tokens personales ni acciones de terceros.
- Dependabot mantiene al día las acciones (`actions/checkout`, `setup-node`, `upload-artifact` y `download-artifact`).
- La app no está firmada: los usuarios ven el aviso de SmartScreen, que la plantilla del release explica. Los checksums permiten comprobar que un archivo no se ha modificado después de publicarlo.
