# Pruebas

[English](TESTING.md) | **Español**

Cómo se prueba KeepToMyShelf: qué cubre cada tipo de prueba, dónde está, cómo se ejecuta y las reglas que sigue cada prueba nueva.

## Cuatro niveles

| Nivel           | Herramienta           | Dónde                                              | Qué comprueba                                                                                                                       |
| --------------- | --------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Unitarias**   | Vitest                | `src/**/*.test.ts`, junto al código; `tests/unit/` | Reglas puras (`core`), utilidades de `main` y la lógica de la interfaz que está fuera de React (`library-view.ts`, `item-form.ts`…) |
| **Integración** | Vitest                | `tests/integration/`                               | Servicios con bases de datos SQLite y archivos reales: migraciones, elementos, multimedia, copias, restauraciones…                  |
| **E2E**         | Playwright + Electron | `tests/e2e/`                                       | La app compilada (`out/`) usada como lo haría una persona: clics, teclado, pantallas, diálogos                                      |
| **Humo**        | Playwright + Electron | `tests/smoke/`                                     | La app empaquetada, instalada con el instalador real y descomprimida desde el zip portable                                          |

La mayoría de las reglas están en `core` y en los servicios, así que la mayoría de las pruebas son unitarias y de integración: rápidas y precisas. Las E2E cubren lo que solo se ve con la app completa (el puente IPC, las pantallas, el teclado, la ventana), y la prueba de humo comprueba que lo que se descarga funciona.

## Cómo se ejecutan

```powershell
npm test                    # unitarias + integración (Vitest), unos segundos
npx vitest run src/core     # solo algunas
npm run test:watch          # las repite con cada cambio

npm run build               # las E2E usan la compilación de out/
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npx playwright test         # todas las E2E, varios minutos
npx playwright test tests/e2e/items.spec.ts   # un solo archivo

npm run package; npm run test:smoke          # la app empaquetada (solo Windows)
```

Cuando falla una E2E, Playwright guarda una traza en `test-results/`; ábrela con `npx playwright show-trace <archivo.zip>` para ver cada paso, con capturas. En la CI, las trazas se suben como el artefacto `e2e-traces`.

## Aislamiento: los datos reales nunca se tocan

- **Cada prueba usa su propia carpeta temporal.** La app lee `KTMS_USER_DATA_DIR` y guarda ahí todos sus datos; la utilidad de las E2E [`launchApp`](../tests/e2e/launch-app.ts) siempre la define, y la prueba de humo hace lo mismo.
- **Las carpetas temporales tienen nombres con caracteres no ASCII** ([`tests/support/temp-dir.ts`](../tests/support/temp-dir.ts)), como las rutas reales del tipo `C:\Users\Adrián`.
- **Las E2E siempre empiezan en inglés** (`--lang=en-US`), sea cual sea el idioma del sistema, y cambian de idioma de forma explícita cuando una prueba lo necesita.
- **Las E2E se ejecutan de una en una** (`workers: 1`): cada una abre su propia copia de la app.

## Utilidades

| Archivo                                                                   | Qué ofrece                                                                                                                                                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`tests/support/profile-fixture.ts`](../tests/support/profile-fixture.ts) | Conecta todos los servicios igual que la app, dentro de una carpeta temporal, con un reloj determinista. El visor del sistema y el Explorador de archivos se sustituyen por registradores. |
| [`tests/support/media-files.ts`](../tests/support/media-files.ts)         | Imágenes de prueba (PNG, un JPEG girado, un GIF animado), un PDF mínimo y un SVG que debe rechazarse.                                                                                      |
| [`tests/support/zip.ts`](../tests/support/zip.ts)                         | Escribe y lee zips de prueba, y altera bytes dentro de ellos para probar copias dañadas o manipuladas.                                                                                     |
| [`tests/e2e/launch-app.ts`](../tests/e2e/launch-app.ts)                   | Abre la app compilada con su propia carpeta de datos.                                                                                                                                      |
| [`tests/e2e/seed-items.ts`](../tests/e2e/seed-items.ts)                   | Escribe elementos y colecciones directamente en la base de datos del perfil, mucho más rápido que rellenar el formulario (10 000 elementos en la prueba de la biblioteca grande).          |

## Reglas para las pruebas nuevas

- **Prueba el comportamiento real.** Una prueba debe fallar sin el cambio que comprueba, siempre que sea razonable verificarlo (deshaz el cambio, mira que falla y vuelve a ponerlo).
- **Cada migración tiene una prueba** que crea una base de datos de la versión anterior con datos, la migra y comprueba que no se ha perdido nada.
- **Cada código de error está traducido:** [`tests/unit/i18n-locales.test.ts`](../tests/unit/i18n-locales.test.ts) busca los códigos en el código y comprueba `es.json` y `en.json`.
- **Busca los elementos por su nombre accesible exacto** en las E2E (`getByRole('button', { name: 'EN', exact: true })`): sin `exact`, «EN» también coincide con «Rename».
- **Tras un cambio de interfaz, ejecuta las E2E tres veces seguidas** para detectar pruebas inestables.
- **Revisión visual:** para ver una pantalla, escribe un spec temporal de Playwright que guarde capturas en una carpeta temporal, y bórralo antes del commit.

## Limitaciones conocidas

- `page.keyboard` de Playwright no pasa por el proceso principal, así que las teclas que gestiona el proceso principal (F11) se envían con `webContents.sendInputEvent`, como una tecla real.
- Playwright no puede arrastrar archivos desde fuera de la ventana. [`drag-and-drop.spec.ts`](../tests/e2e/drag-and-drop.spec.ts) los carga en un `<input type="file">` temporal con `setInputFiles` (esos `File` están respaldados por los archivos del disco, así que Electron conoce su ruta) y los suelta con los eventos de arrastre. El arrastre desde el Explorador o desde un navegador se prueba a mano.
- El modo portable solo se prueba con la app empaquetada (la prueba de humo), porque en desarrollo el `.exe` es el de `node_modules`.
- Las E2E solo se ejecutan en Windows; en Linux harían falta una pantalla virtual (xvfb). Aún no se mide la cobertura. Las dos cosas están anotadas como mejoras en la [hoja de ruta](ROADMAP.md).

## En la CI

| Workflow                                          | Cuándo                                 | Qué ejecuta                                                                                            |
| ------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [`ci.yml`](../.github/workflows/ci.yml)           | Cada pull request y cada push a `main` | Windows y Linux: formato, lint, tipos, Vitest y compilación. Windows: E2E y `package:dir`.             |
| [`release.yml`](../.github/workflows/release.yml) | Una etiqueta `v*`                      | Las mismas comprobaciones con las E2E, el empaquetado y la prueba de humo, antes de crear el borrador. |

`main` solo acepta una pull request con las comprobaciones en verde.
