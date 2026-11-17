# Git workflow

**English** | [Español](GIT-WORKFLOW.es.md)

## Branches

The project follows a simplified **GitHub Flow**:

- `main` is always stable: it builds and passes every check.
- Each change is made on a short branch created from `main`:
  - `feat/<description>`: new feature (`feat/profile-selection`)
  - `fix/<description>`: bug fix
  - `chore/<description>`, `docs/<description>`, `ci/<description>`, `refactor/<description>`, `test/<description>`
- The branch reaches `main` through a **pull request**, even when working alone: the CI runs before merging and the diff gets a calm review.
- Pull requests are merged with **squash merge** (one clean commit per change), and the branch is deleted afterwards.

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <description in the imperative>
```

| Type       | Use                                       |
| ---------- | ----------------------------------------- |
| `feat`     | New feature                               |
| `fix`      | Bug fix                                   |
| `refactor` | Internal change that keeps the behavior   |
| `test`     | Add or fix tests                          |
| `docs`     | Documentation                             |
| `ci`       | Continuous integration                    |
| `chore`    | Maintenance (dependencies, configuration) |

Examples: `feat(items): add alternate titles`, `fix(dates): reject end date before start date`.

A breaking change is marked with `!` (`feat(db)!: ...`) and a `BREAKING CHANGE:` note in the body.

## Typical cycle

```bash
git switch main
git pull
git switch -c feat/my-change
# ...work and small commits...
git push -u origin feat/my-change
# open the pull request on GitHub, wait for the CI to be green, squash merge
```

## Continuous integration

The [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) workflow runs on every push to `main` and every pull request, on Windows and Linux: format, lint, types, tests and build. On Windows it also runs the end-to-end tests and packages the app, to catch distribution problems.

Versions are published with `v*` tags and the [`.github/workflows/release.yml`](../.github/workflows/release.yml) workflow. The procedure is in [RELEASING.md](RELEASING.md).

## Rules

- Credentials, tokens and `.env` files are never committed.
- The history of `main` is never rewritten (`push --force`).
