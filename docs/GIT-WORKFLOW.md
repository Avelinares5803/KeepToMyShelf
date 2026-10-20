# Flujo de trabajo con Git

## Ramas

Se sigue un **GitHub Flow** simplificado:

- `main` siempre está en un estado estable: compila y pasa todas las comprobaciones.
- Cada cambio se hace en una rama corta creada desde `main`:
  - `feat/<descripción>`: nueva funcionalidad (`feat/profile-selection`)
  - `fix/<descripción>`: corrección de errores
  - `chore/<descripción>`, `docs/<descripción>`, `ci/<descripción>`, `refactor/<descripción>`, `test/<descripción>`
- La rama se integra en `main` mediante una **pull request**, aunque se trabaje en solitario: la CI se ejecuta antes de integrar y el diff se revisa con calma.
- Se integra con **squash merge** (un commit limpio por cambio) y la rama se borra después.

## Mensajes de commit

Se usa [Conventional Commits](https://www.conventionalcommits.org/es/):

```
<tipo>(<ámbito opcional>): <descripción en imperativo>
```

| Tipo       | Uso                                          |
| ---------- | -------------------------------------------- |
| `feat`     | Nueva funcionalidad                          |
| `fix`      | Corrección de un error                       |
| `refactor` | Cambio interno sin alterar el comportamiento |
| `test`     | Añadir o corregir pruebas                    |
| `docs`     | Documentación                                |
| `ci`       | Integración continua                         |
| `chore`    | Mantenimiento (dependencias, configuración)  |

Ejemplos: `feat(items): add alternate titles`, `fix(dates): reject end date before start date`.

Un cambio incompatible se marca con `!` (`feat(db)!: ...`) y una nota `BREAKING CHANGE:` en el cuerpo.

## Ciclo típico

```bash
git switch main
git pull
git switch -c feat/mi-cambio
# ...trabajo y commits pequeños...
git push -u origin feat/mi-cambio
# abrir la pull request en GitHub, esperar la CI en verde, squash merge
```

## Integración continua

El workflow [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) se ejecuta en cada push a `main` y en cada pull request, en Windows y Linux: formato, lint, tipos, pruebas y compilación. En Windows, además, se empaqueta la app para detectar problemas de distribución.

## Reglas

- Nunca se versionan credenciales, tokens ni archivos `.env`.
- No se reescribe el historial de `main` (`push --force`).
