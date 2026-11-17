# Development guide

**English** | [Español](DEVELOPMENT.es.md)

How to set up the project, run it, follow its conventions and build the installer. The overall design is in [ARCHITECTURE.md](ARCHITECTURE.md), and the tests in [TESTING.md](TESTING.md).

## Requirements

- **Windows 10 or 11.** Linux works for development and CI, but the installer and the end-to-end tests run on Windows.
- **[Node.js](https://nodejs.org/) 24** or newer (with npm 11).
- **Git.**

No Python or C++ build tools are needed: the native dependencies (`better-sqlite3` and `sharp`) ship prebuilt binaries based on N-API, a stable binary interface that works both in Node.js (tests) and in Electron (app). That is why they are never rebuilt (`npmRebuild: false`).

## Getting started

```powershell
git clone https://github.com/Avelinares5803/KeepToMyShelf.git
cd KeepToMyShelf
npm ci           # installs the exact dependencies and downloads the Electron executable
npm run dev      # opens the app in development mode, reloading on changes
```

- In development, **F12** opens the browser developer tools (the app has no menu).
- `npm run dev` uses your real data folder (`%APPDATA%\KeepToMyShelf`). To try something without touching it, point the app at another folder first: `$env:KTMS_USER_DATA_DIR = "$env:TEMP\ktms-dev"`.

## Scripts

| Command               | What it does                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `npm run dev`         | Runs the app in development mode                                                          |
| `npm run build`       | Builds main, preload and renderer into `out/`                                             |
| `npm test`            | Runs the unit and integration tests (Vitest)                                              |
| `npm run test:watch`  | The same, re-running on changes                                                           |
| `npm run test:e2e`    | Builds the app and runs the end-to-end tests (Playwright)                                 |
| `npm run test:smoke`  | Installs, tests and uninstalls what `npm run package` made (see [TESTING.md](TESTING.md)) |
| `npm run lint`        | Checks the code with ESLint                                                               |
| `npm run typecheck`   | Checks the TypeScript types                                                               |
| `npm run format`      | Formats the code with Prettier (`format:check` only checks)                               |
| `npm run package`     | Makes the installer and the portable zip in `release/<version>/`                          |
| `npm run package:dir` | Makes only the unpacked app in `release/<version>/win-unpacked` (faster)                  |

## Before each push

The same checks as the CI:

```powershell
npm run lint; npm run typecheck; npx prettier --check .; npx vitest run; npm run build
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue; npx playwright test
```

## Windows quirks

- **`ELECTRON_RUN_AS_NODE`:** VS Code's terminal sets it, and then Electron starts as plain Node.js and opens no window. Remove it in that terminal before `npm run dev` or Playwright: `Remove-Item Env:ELECTRON_RUN_AS_NODE`.
- **PowerShell 5.1** has no `&&` (use `;`), and cuts arguments that contain double quotes when passing them to native programs. For commit messages with quotes, write them to a file and use `git commit -F <file>`.
- **Encoding:** `Get-Content`/`Set-Content` use the ANSI code page and damage accents. Edit files with your editor.
- **Paths with non-ASCII characters** (`C:\Users\Adrián\…`) work, and the tests create their temporary folders with such characters on purpose.

## Code conventions

- **TypeScript strict** everywhere, formatted with Prettier and checked with ESLint. TypeScript 6, not 7, until typescript-eslint supports it.
- **Respect the layers** described in [ARCHITECTURE.md](ARCHITECTURE.md#layers): `core` has no Electron or Node.js; the preload only imports types; the renderer never imports from `main`.
- **Every IPC call returns an `IpcResult`.** Expected errors are an `AppError` with a `domain.code` code, translated in both languages.
- **No silent failures:** no generic `catch` that hides an error, no unjustified default values.
- **All visible text in both languages.** Empty fields are not shown in the item view. Every destructive action asks for confirmation, with the focus on "Cancel".
- **Dependencies:** add one only when it is justified, with an exact version that is at least 7 days old. Dependabot proposes updates every week.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/), one branch and one pull request per change. See [GIT-WORKFLOW.md](GIT-WORKFLOW.md).

## Common tasks

### Add an IPC call

1. **Schema:** add the input's zod schema to `ipcInputSchemas` in [`src/shared/ipc-schemas.ts`](../src/shared/ipc-schemas.ts) (`z.undefined()` if it takes none).
2. **Channel:** add it to `IpcChannels` in [`src/shared/ipc.ts`](../src/shared/ipc.ts) (`'area:action'`), and type the method in `KeepToMyShelfApi`.
3. **Preload:** map the method to the channel in [`src/preload/index.ts`](../src/preload/index.ts).
4. **Handler:** add it in [`src/main/ipc/register-handlers.ts`](../src/main/ipc/register-handlers.ts) with `createHandler` (or `createAsyncHandler` if it returns a promise). It only validates and calls a service. TypeScript fails if a channel has no handler.
5. **Errors:** translate every new error code in `es.json` and `en.json` under `errors`.
6. **Tests:** the service's integration test and, if the UI changes, an E2E test.

### Add a translated text

Add the same key to [`src/renderer/i18n/locales/es.json`](../src/renderer/i18n/locales/es.json) and [`en.json`](../src/renderer/i18n/locales/en.json). A test ([`tests/unit/i18n-locales.test.ts`](../tests/unit/i18n-locales.test.ts)) checks that both files have the same keys, that no text is empty and that every error code in `core`, `main` and `shared` is translated. **A new error domain** (the part before the dot) must be added to that test's pattern, or its codes are not checked.

### Change the database schema

1. Create the next numbered file in `src/main/infrastructure/db/migrations/library/` (or `app/`), such as `0007_something.sql`, without `BEGIN`/`COMMIT`.
2. Import it with `?raw` and append it to the list in that folder's `index.ts`.
3. Write a test that creates a database at the previous version with data, migrates it and checks the result. See [`tests/integration/db/library-migration-v6.test.ts`](../tests/integration/db/library-migration-v6.test.ts).

**Never edit a migration that is already in `main`.** If it was wrong, fix it with a new one. Backups store the schema version, and an older app refuses to restore a backup from a newer schema.

### Add a filter

Add a descriptor to `FILTER_FIELDS` in [`src/core/filters/filter-fields.ts`](../src/core/filters/filter-fields.ts). If its type already exists (catalog role, choice, yes/no, rating), the query engine needs no change. Then offer it in the UI (`fieldsToOffer` in `advanced-filters.ts`, and `simple-filters.ts` for the simple filters) and add its label in both languages. A new type of field also needs the engine in [`item-query.ts`](../src/main/infrastructure/db/item-query.ts).

### Change the default catalogs

The default lists in [`default-catalogs.ts`](../src/main/infrastructure/db/default-catalogs.ts) are copied **once per profile**, when it first opens. Values added later only reach new profiles. A new catalog needs its own flag (like `default_countries_seeded`) so that existing profiles receive it. Aliases must not be redundant; a test enforces it.

### Change the app icon

Edit `build/icon.svg` and run `node scripts/render-icon.mjs`, which writes `build/icon.png`. electron-builder makes the `.ico` from it.

## Building the installer

```powershell
npm run package
```

It builds the app, runs electron-builder (NSIS installer and `release/<version>/win-unpacked`) and then `scripts/package-portable.mjs`, which makes the portable zip. The results are in `release/<version>/`:

- `KeepToMyShelf-Setup-<version>.exe`: the installer.
- `KeepToMyShelf-Portable-<version>.zip`: the portable version, with a `KeepToMyShelf\` folder that holds the app and a `KeepToMyShelf Data\` folder, empty but for a readme.
- `win-unpacked\`: the app without installer, handy for a quick test.

To check the result, `npm run test:smoke` installs it in a temporary folder, tests it and uninstalls it (it refuses to start if KeepToMyShelf is already installed for your user). Publishing a version is described in [RELEASING.md](RELEASING.md).
