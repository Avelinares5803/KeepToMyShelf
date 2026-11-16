import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Folder next to KeepToMyShelf.exe that turns the app into a portable copy. The portable .zip
 * ships it, empty but for a readme; an installed copy never has it.
 */
export const PORTABLE_DATA_FOLDER = 'KeepToMyShelf Data';

/**
 * Where the app keeps its data:
 * - `portable`: a "KeepToMyShelf Data" folder sits next to the .exe, so the data travels with
 *   the app (a USB stick, for example) and never mixes with an installed copy.
 * - `override`: automated tests point the app at a temporary folder with KTMS_USER_DATA_DIR.
 * - `default`: Electron's own userData folder (%APPDATA%\KeepToMyShelf on Windows).
 *
 * A portable copy always uses its own folder, even with KTMS_USER_DATA_DIR set: a test of the
 * portable copy then sets both, and a mistake can only end up in the test's other folder, never
 * in the real data.
 */
export type UserDataLocation =
  | { readonly kind: 'portable'; readonly dir: string }
  | { readonly kind: 'override'; readonly dir: string }
  | { readonly kind: 'default' };

export function resolveUserDataLocation(options: {
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Folder of the running executable (KeepToMyShelf.exe, or electron.exe in development). */
  readonly exeDir: string;
}): UserDataLocation {
  const portableDir = join(options.exeDir, PORTABLE_DATA_FOLDER);
  if (directoryExists(portableDir)) return { kind: 'portable', dir: portableDir };
  const override = options.env['KTMS_USER_DATA_DIR'];
  if (override) return { kind: 'override', dir: override };
  return { kind: 'default' };
}

function directoryExists(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

const PROBE_FILE = '.write-test';

/**
 * Checks that files can be written in `dir`, throwing the system error if not. A portable copy
 * may sit in a read-only place (Program Files, a locked USB stick), and Electron would then fail
 * quietly: without a writable userData folder, the single-instance lock cannot be taken and the
 * app just quits.
 */
export function ensureWritableDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
  const probe = join(dir, PROBE_FILE);
  writeFileSync(probe, '');
  rmSync(probe);
}
