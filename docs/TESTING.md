# Testing

**English** | [Español](TESTING.es.md)

How KeepToMyShelf is tested: what each kind of test covers, where it lives, how to run it and the rules every new test follows.

## Four levels

| Level           | Tool                  | Where                                               | What it checks                                                                                                  |
| --------------- | --------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Unit**        | Vitest                | `src/**/*.test.ts`, next to the code; `tests/unit/` | Pure rules (`core`), helpers of `main` and the UI logic kept outside React (`library-view.ts`, `item-form.ts`…) |
| **Integration** | Vitest                | `tests/integration/`                                | Services with real SQLite databases and real files: migrations, items, media, backups, restores…                |
| **End-to-end**  | Playwright + Electron | `tests/e2e/`                                        | The built app (`out/`) used like a person would: clicks, keyboard, screens, dialogs                             |
| **Smoke**       | Playwright + Electron | `tests/smoke/`                                      | The packaged app, installed with the real installer and unzipped from the portable zip                          |

Most rules live in `core` and the services, so most tests are unit and integration tests: they are fast and precise. The E2E tests cover what only the whole app can show (the IPC bridge, the screens, the keyboard, the window), and the smoke test checks that what users download works.

## Running them

```powershell
npm test                    # unit + integration (Vitest), a few seconds
npx vitest run src/core     # only some of them
npm run test:watch          # re-runs them on every change

npm run build               # the E2E tests drive the build in out/
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npx playwright test         # all the E2E tests, several minutes
npx playwright test tests/e2e/items.spec.ts   # a single file

npm run package; npm run test:smoke          # the packaged app (Windows only)
```

When an E2E test fails, Playwright keeps a trace in `test-results/`; open it with `npx playwright show-trace <file.zip>` to see each step, with screenshots. In the CI, the traces are uploaded as the `e2e-traces` artifact.

## Isolation: real data is never touched

- **Every test uses its own temporary folder.** The app reads `KTMS_USER_DATA_DIR` and keeps all its data there; the E2E helper [`launchApp`](../tests/e2e/launch-app.ts) always sets it, and the smoke test does the same.
- **Temporary folders have non-ASCII names** ([`tests/support/temp-dir.ts`](../tests/support/temp-dir.ts)), like real user paths such as `C:\Users\Adrián`.
- **The E2E tests always start in English** (`--lang=en-US`), whatever the system language, and switch language explicitly when a test needs it.
- **The E2E tests run one at a time** (`workers: 1`): each one launches its own copy of the app.

## Helpers

| File                                                                      | What it offers                                                                                                                                                           |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`tests/support/profile-fixture.ts`](../tests/support/profile-fixture.ts) | Wires every service exactly like the app does, inside a temporary folder, with a deterministic clock. The system viewer and the File Explorer are replaced by recorders. |
| [`tests/support/media-files.ts`](../tests/support/media-files.ts)         | Test images (PNG, a rotated JPEG, an animated GIF), a minimal PDF and an SVG that must be rejected.                                                                      |
| [`tests/support/zip.ts`](../tests/support/zip.ts)                         | Writes and reads test zips, and alters bytes inside them to try damaged or tampered backups.                                                                             |
| [`tests/e2e/launch-app.ts`](../tests/e2e/launch-app.ts)                   | Launches the built app with its own data folder.                                                                                                                         |
| [`tests/e2e/seed-items.ts`](../tests/e2e/seed-items.ts)                   | Writes items and collections straight into the profile's database, much faster than filling in the form (10,000 items in the large library test).                        |

## Rules for new tests

- **Test the real behavior.** A test must fail without the change it checks, whenever that is reasonable to verify (undo the change, see it fail, restore it).
- **Each migration has a test** that creates a database at the previous version with data, migrates it and checks that nothing was lost.
- **Each error code is translated:** [`tests/unit/i18n-locales.test.ts`](../tests/unit/i18n-locales.test.ts) finds the codes in the code and checks `es.json` and `en.json`.
- **Find elements by their exact accessible name** in the E2E tests (`getByRole('button', { name: 'EN', exact: true })`): without `exact`, "EN" also matches "Rename".
- **After a UI change, run the E2E tests three times in a row** to catch flaky tests.
- **Visual review:** to look at a screen, write a temporary Playwright spec that saves screenshots to a temporary folder, and delete it before committing.

## Known limits

- Playwright's `page.keyboard` does not go through the main process, so keys the main process handles (F11) are sent with `webContents.sendInputEvent`, like a real key.
- Playwright cannot drag files from outside the window. [`drag-and-drop.spec.ts`](../tests/e2e/drag-and-drop.spec.ts) loads them into a temporary file input with `setInputFiles` (those `File` objects are backed by the files on disk, so Electron knows their paths) and drops them with the drag events. Dragging from the File Explorer or from a web browser is tested by hand.
- The portable mode is only tested with the packaged app (the smoke test), because in development the `.exe` is the one in `node_modules`.
- The E2E tests only run on Windows; Linux would need a virtual display (xvfb). There is no coverage measurement yet. Both are noted as future improvements in the [roadmap](ROADMAP.md).

## In the CI

| Workflow                                          | When                                  | What it runs                                                                                    |
| ------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [`ci.yml`](../.github/workflows/ci.yml)           | Every pull request and push to `main` | Windows and Linux: format, lint, types, Vitest and build. Windows: E2E tests and `package:dir`. |
| [`release.yml`](../.github/workflows/release.yml) | A `v*` tag                            | The same checks with the E2E tests, packaging and the smoke test, before drafting the release.  |

`main` only accepts a pull request when the checks are green.
