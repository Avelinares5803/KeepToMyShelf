# ADR 0001: Electron + TypeScript + React + SQLite

- **Estado:** aceptada
- **Fecha:** 2026-10-20

## Contexto

KeepToMyShelf es una aplicación de escritorio local (sin servidor) para Windows 10/11, con posible soporte futuro para Linux y macOS. Necesita una interfaz visual cuidada (cuadrículas de portadas, fondos con desenfoque, temas), persistencia fiable de datos relacionales, procesamiento de imágenes y un empaquetado sencillo. La desarrolla una sola persona que conoce Python y JavaScript/TypeScript.

## Decisión

- **Electron** como plataforma de escritorio.
- **TypeScript** (estricto) en todo el proyecto.
- **React** para la interfaz, compilada con **electron-vite**.
- **SQLite** mediante **better-sqlite3** para la persistencia.
- **sharp** para miniaturas y optimización de imágenes.
- **electron-builder** para generar el instalador NSIS.
- **Vitest** para pruebas; **ESLint** + **Prettier** para calidad y formato.

## Alternativas consideradas

| Alternativa             | Por qué se descartó                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Python + PySide6 (Qt)   | Empaquetado frágil (PyInstaller/Nuitka) con falsos positivos de antivirus; efectos visuales modernos más costosos de lograr que con CSS.    |
| Tauri + TypeScript      | La lógica nativa (base de datos, archivos, imágenes) exige Rust, un segundo lenguaje exigente. Su ventaja (memoria y tamaño) no es crítica. |
| `node:sqlite` (Node.js) | Validado y funcional (ver más abajo), pero aún en desarrollo activo en Node 24. Queda como alternativa si better-sqlite3 diera problemas.   |

## Consecuencias

- Un solo lenguaje y un ecosistema maduro de testing y distribución.
- Instalador de unos 120 MB y mayor consumo de memoria que una app nativa.
- Electron debe actualizarse periódicamente para recibir parches de seguridad.
- Arquitectura de seguridad obligatoria: `contextIsolation`, `sandbox`, sin `nodeIntegration`, CSP estricta y un preload que expone solo una API mínima.

## Validación (prueba técnica de la fase F0)

Se ejecutó una prueba temporal dentro de la **app instalada** con el instalador NSIS, en una ruta de usuario con caracteres no ASCII (`C:\Users\Adrián\...`). Todas las comprobaciones pasaron:

| Comprobación   | Resultado                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| better-sqlite3 | SQLite 3.53.4, modo WAL y claves foráneas activos, lectura y escritura con texto Unicode en archivo `biblioteca-ñáü.db` |
| node:sqlite    | SQLite 3.53.4, funcional                                                                                                |
| sharp          | Miniatura WebP generada en una ruta con `ñáü`                                                                           |
| Interfaz       | React renderiza, el puente del preload responde, `require` no es accesible desde la UI y no hay violaciones de CSP      |

Versiones: Electron 44.9.1 (Node 24.22.0, Chromium 152).

**Hallazgos relevantes:**

- better-sqlite3 13 y sharp 0.35 se distribuyen con binarios precompilados basados en **N-API**, una interfaz binaria estable. El mismo binario funciona en Node (pruebas) y en Electron (app), así que **no hace falta recompilar** módulos nativos (`npmRebuild: false`).
- npm 11 ya no ejecuta automáticamente los scripts de instalación de las dependencias. Se deniegan de forma explícita los de `better-sqlite3` (intentaría compilar desde el código fuente sin necesidad) y `electron-winstaller` (no usamos instaladores Squirrel). El ejecutable de Electron se descarga con su script oficial `install-electron` en `postinstall`.
- Se usa TypeScript 6.0, no 7, porque typescript-eslint aún no admite TypeScript 7.
