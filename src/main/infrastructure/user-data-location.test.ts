import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ensureWritableDir,
  PORTABLE_DATA_FOLDER,
  resolveUserDataLocation,
} from './user-data-location';

describe('resolveUserDataLocation', () => {
  let exeDir: string;

  beforeEach(() => {
    exeDir = mkdtempSync(join(tmpdir(), 'ktms-exe-ñá-'));
  });

  afterEach(() => {
    rmSync(exeDir, { recursive: true, force: true });
  });

  it('uses the default folder without a data folder or a variable', () => {
    expect(resolveUserDataLocation({ env: {}, exeDir })).toEqual({ kind: 'default' });
  });

  it('uses the test folder from KTMS_USER_DATA_DIR', () => {
    expect(
      resolveUserDataLocation({ env: { KTMS_USER_DATA_DIR: 'C:\\tmp\\ktms' }, exeDir }),
    ).toEqual({ kind: 'override', dir: 'C:\\tmp\\ktms' });
  });

  it('ignores an empty KTMS_USER_DATA_DIR', () => {
    expect(resolveUserDataLocation({ env: { KTMS_USER_DATA_DIR: '' }, exeDir })).toEqual({
      kind: 'default',
    });
  });

  it('keeps the data in the data folder next to the .exe', () => {
    mkdirSync(join(exeDir, PORTABLE_DATA_FOLDER));
    expect(resolveUserDataLocation({ env: {}, exeDir })).toEqual({
      kind: 'portable',
      dir: join(exeDir, PORTABLE_DATA_FOLDER),
    });
  });

  it('prefers the data folder over KTMS_USER_DATA_DIR', () => {
    mkdirSync(join(exeDir, PORTABLE_DATA_FOLDER));
    const location = resolveUserDataLocation({
      env: { KTMS_USER_DATA_DIR: 'C:\\tmp\\ktms' },
      exeDir,
    });
    expect(location).toEqual({ kind: 'portable', dir: join(exeDir, PORTABLE_DATA_FOLDER) });
  });

  it('is not portable when a file has the data folder name', () => {
    writeFileSync(join(exeDir, PORTABLE_DATA_FOLDER), '');
    expect(resolveUserDataLocation({ env: {}, exeDir })).toEqual({ kind: 'default' });
  });
});

describe('ensureWritableDir', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ktms-user-data-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('accepts a writable folder and leaves nothing behind', () => {
    writeFileSync(join(root, 'app.db'), 'data');
    ensureWritableDir(root);
    expect(readdirSync(root)).toEqual(['app.db']);
  });

  it('creates the folder if it is missing', () => {
    const dir = join(root, 'Juegos de Adrián', PORTABLE_DATA_FOLDER);
    ensureWritableDir(dir);
    expect(existsSync(dir)).toBe(true);
  });

  it('throws when the folder cannot be written', () => {
    // A file where a folder should be: the same error on every system, without needing a
    // read-only folder.
    const file = join(root, 'not-a-folder');
    writeFileSync(file, '');
    expect(() => ensureWritableDir(join(file, PORTABLE_DATA_FOLDER))).toThrow();
  });
});
