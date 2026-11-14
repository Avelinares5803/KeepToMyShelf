import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../../../src/core/errors';
import { EMPTY_ITEM_DRAFT } from '../../../src/core/items/item-draft';
import { openDatabase } from '../../../src/main/infrastructure/db/connection';
import { libraryMigrations } from '../../../src/main/infrastructure/db/migrations/library';
import { migrate } from '../../../src/main/infrastructure/db/migrator';
import { MediaStore } from '../../../src/main/infrastructure/media/media-store';
import type { BackupManifest, BackupProgress } from '../../../src/shared/backups';
import { PDF_BYTES, pngImage, writeFile } from '../../support/media-files';
import { createProfileFixture, type ProfileFixture } from '../../support/profile-fixture';
import { readZip, replaceInFile, writeTestZip, type TestZipEntry } from '../../support/zip';

async function expectCode(running: Promise<unknown>, code: string): Promise<void> {
  const error: unknown = await running.then(
    () => expect.fail(`Expected error "${code}"`),
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
}

const noProgress = () => {};

/** Every entry of a backup, in order, as a test archive can write them again. */
async function entriesOf(path: string): Promise<TestZipEntry[]> {
  return [...(await readZip(path))].map(([name, entry]) => ({
    name,
    bytes: entry.bytes,
    compress: entry.compressed,
  }));
}

function manifestOf(entries: readonly TestZipEntry[]): BackupManifest {
  const entry = entries.find(({ name }) => name === 'manifest.json')!;
  return JSON.parse(entry.bytes.toString('utf8')) as BackupManifest;
}

function withManifest(entries: readonly TestZipEntry[], manifest: unknown): TestZipEntry[] {
  return entries.map((entry) =>
    entry.name === 'manifest.json'
      ? { ...entry, bytes: Buffer.from(JSON.stringify(manifest)) }
      : entry,
  );
}

const titlesOf = (fx: ProfileFixture, token: string) =>
  fx.sessions.require(token).db.prepare('SELECT title FROM item ORDER BY title').pluck().all();

describe('RestoreService', () => {
  let fx: ProfileFixture;
  let profileId: string;
  let token: string;
  let image: Buffer;
  /** A backup of Ana: an item with an optimized cover (and its original) and a PDF. */
  let backupPath: string;

  /** Another installation of the app, for restoring there. */
  let other: ProfileFixture | null = null;

  async function addItemWithMedia(title: string): Promise<void> {
    const cover = await fx.media.prepareImport(token, writeFile(fx.scratchDir, 'cover.png', image));
    const document = await fx.media.prepareImport(
      token,
      writeFile(fx.scratchDir, 'Manual.pdf', PDF_BYTES),
    );
    fx.items.create(
      token,
      'game',
      { ...EMPTY_ITEM_DRAFT, title },
      {
        cover: { kind: 'prepared', preparedId: cover.id, choice: 'optimized_with_original' },
        documents: [{ kind: 'prepared', preparedId: document.id, label: 'Manual' }],
      },
    );
  }

  /** Writes a test archive in the scratch folder and returns its path. */
  async function archive(name: string, entries: readonly TestZipEntry[]): Promise<string> {
    const path = join(fx.scratchDir, name);
    await writeTestZip(path, entries);
    return path;
  }

  /** Only Ana's folder: nothing half restored was left behind. */
  function expectNothingLeftBehind(): void {
    expect(readdirSync(fx.paths.profilesDir)).toEqual([profileId]);
    expect(fx.profiles.list().map((profile) => profile.name)).toEqual(['Ana']);
  }

  beforeEach(async () => {
    fx = createProfileFixture();
    profileId = fx.profiles.create({ name: 'Ana', language: 'en' }).profile.id;
    fx.settings.setForProfile(profileId, { key: 'theme', value: 'dark' });
    token = fx.sessions.open(profileId).token;
    image ??= await pngImage(2400, 1200);
    await addItemWithMedia('Chrono Trigger');
    backupPath = join(fx.scratchDir, 'Copia de Ana.zip');
    await fx.backups.createForSession(token, backupPath, noProgress);
  });

  afterEach(() => {
    fx.cleanup();
    other?.cleanup();
    other = null;
  });

  describe('restoreAsNew', () => {
    it('restores the library, its files and its own preferences as a new profile', async () => {
      const change = await fx.restores.restoreAsNew(backupPath, noProgress);

      // The name was taken, so it gets "(1)", like a new profile would.
      expect(change).toMatchObject({ renamed: true, profile: { name: 'Ana (1)' } });
      const restoredId = change.profile.id;
      expect(restoredId).not.toBe(profileId);
      // A new profile for this installation: created now, not when the original was.
      expect(change.profile.createdAt > fx.profiles.get(profileId).createdAt).toBe(true);
      expect(fx.settings.getOwnForProfile(restoredId)).toEqual({ language: 'en', theme: 'dark' });

      const restoredToken = fx.sessions.open(restoredId).token;
      expect(titlesOf(fx, restoredToken)).toEqual(['Chrono Trigger']);
      const db = fx.sessions.require(restoredToken).db;
      const rows = db.prepare('SELECT sha256, store, format FROM media_file').all() as {
        sha256: string;
        store: 'files' | 'originals';
        format: 'webp' | 'png' | 'pdf';
      }[];
      expect(rows).toHaveLength(3);
      const store = new MediaStore(fx.paths.mediaDir(restoredId), fx.paths.cacheDir(restoredId));
      for (const row of rows) {
        expect(existsSync(store.filePath(row.store, row.sha256, row.format))).toBe(true);
      }
      expect(readdirSync(fx.paths.profilesDir).sort()).toEqual([profileId, restoredId].sort());
    });

    it('keeps the name in another installation where it is free', async () => {
      other = createProfileFixture();

      const change = await other.restores.restoreAsNew(backupPath, noProgress);

      expect(change).toMatchObject({ renamed: false, profile: { name: 'Ana' } });
    });

    it('reports its progress up to the whole size', async () => {
      const progress: BackupProgress[] = [];

      await fx.restores.restoreAsNew(backupPath, (step) => progress.push(step));

      expect(progress[0]).toMatchObject({ stage: 'restore', doneBytes: 0 });
      const last = progress.at(-1)!;
      expect(last.doneBytes).toBe(last.totalBytes);
      expect(last.totalBytes).toBeGreaterThan(0);
    });

    it('brings a library from an older version up to date', async () => {
      const dbPath = join(fx.scratchDir, 'old.db');
      const old = openDatabase(dbPath);
      migrate(old, libraryMigrations.slice(0, 3));
      old.close();
      const entries = await entriesOf(backupPath);
      const manifest = manifestOf(entries);
      const path = await archive('antigua.zip', [
        {
          name: 'manifest.json',
          bytes: Buffer.from(
            JSON.stringify({
              ...manifest,
              librarySchemaVersion: 3,
              media: { files: 0, bytes: 0, missing: 0 },
            }),
          ),
        },
        { name: 'library.db', bytes: readFileSync(dbPath), compress: true },
      ]);

      const { profile } = await fx.restores.restoreAsNew(path, noProgress);

      const restored = fx.sessions.open(profile.id).token;
      const version = fx.sessions.require(restored).db.pragma('user_version', { simple: true });
      expect(version).toBe(libraryMigrations.length);
    });

    it('fails when another backup or restore is running', async () => {
      const running = fx.restores.restoreAsNew(backupPath, noProgress);

      await expectCode(fx.restores.restoreAsNew(backupPath, noProgress), 'backup.busy');
      await running;
    });

    describe('refuses a backup that is not right, leaving nothing behind', () => {
      async function expectRefused(path: string, code: string): Promise<void> {
        await expectCode(fx.restores.restoreAsNew(path, noProgress), code);
        expectNothingLeftBehind();
      }

      it('a path that climbs out of the folder', async () => {
        const entries = await entriesOf(backupPath);
        const path = await archive('rutas.zip', [
          ...entries,
          { name: 'xx/evil.txt', bytes: Buffer.from('x') },
        ]);
        replaceInFile(path, Buffer.from('xx/evil.txt'), Buffer.from('../evil.txt'));

        await expectRefused(path, 'backup.invalid_file');
        expect(existsSync(join(fx.paths.profilesDir, '..', 'evil.txt'))).toBe(false);
      });

      it('an absolute path', async () => {
        const entries = await entriesOf(backupPath);
        const path = await archive('absoluta.zip', [
          ...entries,
          { name: 'xevil.txt', bytes: Buffer.from('x') },
        ]);
        replaceInFile(path, Buffer.from('xevil.txt'), Buffer.from('/evil.txt'));

        await expectRefused(path, 'backup.invalid_file');
      });

      it('an entry a backup does not have', async () => {
        const entries = await entriesOf(backupPath);
        const path = await archive('extra.zip', [
          ...entries,
          { name: 'notes.txt', bytes: Buffer.from('x') },
        ]);

        await expectRefused(path, 'backup.invalid_file');
      });

      it('the same entry twice', async () => {
        const entries = await entriesOf(backupPath);
        const path = await archive('doble.zip', [...entries, entries[0]!]);

        await expectRefused(path, 'backup.invalid_file');
      });

      it('a stored file that does not match its hash', async () => {
        const entries = await entriesOf(backupPath);
        const pdf = entries.find(({ name }) => name.endsWith('.pdf'))!;
        const wrong = `media/files/ff/${'f'.repeat(64)}.pdf`;
        const path = await archive(
          'hash.zip',
          entries.map((entry) => (entry === pdf ? { ...entry, name: wrong } : entry)),
        );

        await expectRefused(path, 'backup.damaged');
      });

      it('a stored file whose bytes were changed (wrong CRC)', async () => {
        const entries = await entriesOf(backupPath);
        const path = await archive('crc.zip', entries);
        replaceInFile(path, Buffer.from('/Catalog'), Buffer.from('/Catalox'));

        await expectRefused(path, 'backup.damaged');
      });

      it('a library whose bytes were changed, though SQLite would still read it', async () => {
        const entries = await entriesOf(backupPath);
        // Stored as it is, so its bytes can be changed in the archive.
        const path = await archive(
          'titulo.zip',
          entries.map((entry) =>
            entry.name === 'library.db' ? { ...entry, compress: false } : entry,
          ),
        );
        replaceInFile(path, Buffer.from('Chrono Trigger'), Buffer.from('Chrono Triggex'));

        await expectRefused(path, 'backup.damaged');
      });

      it('a library that is not a database', async () => {
        const entries = await entriesOf(backupPath);
        const path = await archive(
          'nodb.zip',
          entries.map((entry) =>
            entry.name === 'library.db' ? { ...entry, bytes: Buffer.from('not sqlite') } : entry,
          ),
        );

        await expectRefused(path, 'backup.damaged');
      });

      it('a corrupt library', async () => {
        const entries = await entriesOf(backupPath);
        const path = await archive(
          'corrupta.zip',
          entries.map((entry) => {
            if (entry.name !== 'library.db') return entry;
            const bytes = Buffer.from(entry.bytes);
            // Garbage over the second page and the next ones, keeping the header intact.
            bytes.fill(0xab, 4096, Math.min(bytes.length, 4096 * 4));
            return { ...entry, bytes };
          }),
        );

        await expectRefused(path, 'backup.damaged');
      });

      it('a library from a newer version of the app', async () => {
        const entries = await entriesOf(backupPath);
        const manifest = manifestOf(entries);
        const path = await archive(
          'nueva.zip',
          withManifest(entries, { ...manifest, librarySchemaVersion: 999 }),
        );

        await expectRefused(path, 'backup.too_new');
      });

      it('a newer backup format', async () => {
        const entries = await entriesOf(backupPath);
        const path = await archive(
          'formato.zip',
          withManifest(entries, { format: 'keeptomyshelf-backup', formatVersion: 2 }),
        );

        await expectRefused(path, 'backup.too_new');
      });

      it('a library whose version is not the one the manifest says', async () => {
        const entries = await entriesOf(backupPath);
        const manifest = manifestOf(entries);
        const path = await archive(
          'version.zip',
          withManifest(entries, {
            ...manifest,
            librarySchemaVersion: manifest.librarySchemaVersion - 1,
          }),
        );

        await expectRefused(path, 'backup.invalid_file');
      });

      it('fewer files than the manifest lists', async () => {
        const entries = await entriesOf(backupPath);
        const path = await archive(
          'faltan.zip',
          entries.filter(({ name }) => !name.endsWith('.pdf')),
        );

        await expectRefused(path, 'backup.invalid_file');
      });

      it('a manifest with a profile name that is not valid', async () => {
        const entries = await entriesOf(backupPath);
        const manifest = manifestOf(entries);
        const path = await archive(
          'nombre.zip',
          withManifest(entries, { ...manifest, profile: { ...manifest.profile, name: '  ' } }),
        );

        await expectRefused(path, 'backup.invalid_file');
      });

      it('no manifest', async () => {
        const entries = await entriesOf(backupPath);
        const path = await archive(
          'sinmanifiesto.zip',
          entries.filter(({ name }) => name !== 'manifest.json'),
        );

        await expectRefused(path, 'backup.invalid_file');
      });

      it('a manifest of something else', async () => {
        const entries = await entriesOf(backupPath);
        const path = await archive('otro.zip', withManifest(entries, { hello: 'world' }));

        await expectRefused(path, 'backup.invalid_file');
      });

      it('a file that is not a .zip', async () => {
        await expectRefused(
          writeFile(fx.scratchDir, 'texto.zip', Buffer.from('hola')),
          'backup.invalid_file',
        );
      });

      it('a .zip cut short', async () => {
        const bytes = readFileSync(backupPath);
        const path = writeFile(fx.scratchDir, 'cortada.zip', bytes.subarray(0, bytes.length / 2));

        await expectRefused(path, 'backup.invalid_file');
      });
    });
  });

  describe('preferences', () => {
    /** A background imported in an installation, as a picture of its own. */
    async function importBackground(fixture: ProfileFixture, picture: Buffer) {
      const path = writeFile(fixture.scratchDir, 'fondo.png', picture);
      const { prepared } = await fixture.backgrounds.prepareMany(null, [path]);
      return fixture.backgrounds.commitImport(prepared[0]!.id, 'original');
    }

    it('finds the imported background by its picture, not by its id', async () => {
      const picture = await pngImage(300, 200);
      const background = await importBackground(fx, picture);
      fx.settings.setForProfile(profileId, {
        key: 'background',
        value: { kind: 'imported', id: background.id },
      });
      await fx.backups.createForSession(token, join(fx.scratchDir, 'fondo.zip'), noProgress);
      // In another installation, id 1 is another picture and the same one has another id.
      other = createProfileFixture();
      await importBackground(other, await pngImage(320, 200));
      const same = await importBackground(other, picture);
      expect(same.id).not.toBe(background.id);

      const { profile } = await other.restores.restoreAsNew(
        join(fx.scratchDir, 'fondo.zip'),
        noProgress,
      );

      expect(other.settings.getOwnForProfile(profile.id).background).toEqual({
        kind: 'imported',
        id: same.id,
      });
    });

    it('follows the global background when the picture is not in the gallery', async () => {
      const background = await importBackground(fx, await pngImage(300, 200));
      fx.settings.setForProfile(profileId, {
        key: 'background',
        value: { kind: 'imported', id: background.id },
      });
      await fx.backups.createForSession(token, join(fx.scratchDir, 'fondo.zip'), noProgress);
      other = createProfileFixture();
      // Its id exists there, but it is another picture.
      await importBackground(other, await pngImage(320, 200));

      const { profile } = await other.restores.restoreAsNew(
        join(fx.scratchDir, 'fondo.zip'),
        noProgress,
      );

      expect(other.settings.getOwnForProfile(profile.id)).toEqual({
        language: 'en',
        theme: 'dark',
      });
    });

    it('keeps the background id of a backup made before the hash was saved, if it exists', async () => {
      const background = await importBackground(fx, await pngImage(300, 200));
      const entries = await entriesOf(backupPath);
      const manifest = manifestOf(entries);
      const path = await archive(
        'antigua.zip',
        withManifest(entries, {
          ...manifest,
          settings: { ...manifest.settings, background: { kind: 'imported', id: background.id } },
        }),
      );

      const { profile } = await fx.restores.restoreAsNew(path, noProgress);

      expect(fx.settings.getOwnForProfile(profile.id).background).toEqual({
        kind: 'imported',
        id: background.id,
      });
    });

    it('skips unknown preferences and values that are not valid', async () => {
      const entries = await entriesOf(backupPath);
      const manifest = manifestOf(entries);
      const path = await archive(
        'ajustes.zip',
        withManifest(entries, {
          ...manifest,
          settings: { language: 'en', theme: 'purple', fromTheFuture: true, backgroundBlur: 12 },
        }),
      );

      const { profile } = await fx.restores.restoreAsNew(path, noProgress);

      expect(fx.settings.getOwnForProfile(profile.id)).toEqual({
        language: 'en',
        backgroundBlur: 12,
      });
    });
  });

  describe('restoreOver', () => {
    it('replaces the open profile with the backup, after saving its current state', async () => {
      fx.items.create(token, 'game', { ...EMPTY_ITEM_DRAFT, title: 'Zelda' });
      fx.settings.setForProfile(profileId, { key: 'theme', value: 'light' });
      fx.profiles.rename(profileId, 'Ana María');
      const progress: BackupProgress[] = [];

      const preview = await fx.restores.preview(token, backupPath);
      expect(preview).toMatchObject({
        fileName: 'Copia de Ana.zip',
        profileName: 'Ana',
        files: 3,
      });
      const restored = await fx.restores.restoreOver(token, preview.restoreId, (step) =>
        progress.push(step),
      );

      // The profile keeps its name and is open again, with a new token.
      expect(restored.profile).toMatchObject({ id: profileId, name: 'Ana María' });
      expect(restored.token).not.toBe(token);
      expect(() => fx.sessions.require(token)).toThrow(AppError);
      expect(titlesOf(fx, restored.token)).toEqual(['Chrono Trigger']);
      expect(fx.settings.getOwnForProfile(profileId)).toEqual({ language: 'en', theme: 'dark' });
      expect(new Set(progress.map((step) => step.stage))).toEqual(new Set(['restore', 'backup']));

      // The state it replaced is in the automatic backups.
      const [automatic, ...rest] = readdirSync(fx.paths.backupsDir);
      expect(rest).toEqual([]);
      expect(automatic).toMatch(/ - Ana María - before-restore\.zip$/);
      const saved = await readZip(join(fx.paths.backupsDir, automatic!));
      const snapshotPath = join(fx.scratchDir, 'antes.db');
      writeFileSync(snapshotPath, saved.get('library.db')!.bytes);
      const snapshot = openDatabase(snapshotPath);
      try {
        expect(snapshot.prepare('SELECT title FROM item ORDER BY title').pluck().all()).toEqual([
          'Chrono Trigger',
          'Zelda',
        ]);
      } finally {
        snapshot.close();
      }
      // The old folder is gone.
      expect(readdirSync(fx.paths.profilesDir)).toEqual([profileId]);
    });

    it('leaves the profile as it was, and open, when the backup is damaged', async () => {
      fx.items.create(token, 'game', { ...EMPTY_ITEM_DRAFT, title: 'Zelda' });
      const entries = await entriesOf(backupPath);
      const path = await archive('crc.zip', entries);
      replaceInFile(path, Buffer.from('/Catalog'), Buffer.from('/Catalox'));
      const { restoreId } = await fx.restores.preview(token, path);

      await expectCode(fx.restores.restoreOver(token, restoreId, noProgress), 'backup.damaged');

      expect(titlesOf(fx, token)).toEqual(['Chrono Trigger', 'Zelda']);
      // No backup of the current state was needed.
      expect(existsSync(fx.paths.backupsDir) ? readdirSync(fx.paths.backupsDir) : []).toEqual([]);
      expectNothingLeftBehind();
    });

    it('restores nothing when the backup of the current state fails', async () => {
      // A file where the backups folder should be: nothing can be written there.
      rmSync(fx.paths.backupsDir, { recursive: true, force: true });
      writeFileSync(fx.paths.backupsDir, 'x');
      fx.items.create(token, 'game', { ...EMPTY_ITEM_DRAFT, title: 'Zelda' });
      const { restoreId } = await fx.restores.preview(token, backupPath);

      await expectCode(
        fx.restores.restoreOver(token, restoreId, noProgress),
        'backup.safety_backup_failed',
      );

      expect(titlesOf(fx, token)).toEqual(['Chrono Trigger', 'Zelda']);
      expectNothingLeftBehind();
    });

    it.runIf(process.platform === 'win32')(
      'opens the profile again as it was when its folder cannot be replaced',
      async () => {
        fx.items.create(token, 'game', { ...EMPTY_ITEM_DRAFT, title: 'Zelda' });
        const { restoreId } = await fx.restores.preview(token, backupPath);
        // Windows refuses to rename a folder while one of its files is open.
        const lockedDir = join(fx.paths.profileDir(profileId), 'locked');
        mkdirSync(lockedDir);
        const handle = openSync(join(lockedDir, 'file.txt'), 'w');
        try {
          await expectCode(
            fx.restores.restoreOver(token, restoreId, noProgress),
            'backup.restore_failed',
          );
        } finally {
          closeSync(handle);
        }

        const session = fx.sessions.currentSession();
        expect(session?.profileId).toBe(profileId);
        expect(titlesOf(fx, session!.token)).toEqual(['Chrono Trigger', 'Zelda']);
        expect(readdirSync(fx.paths.profilesDir)).toEqual([profileId]);
      },
    );

    it('needs the backup previewed in the same session', async () => {
      const { restoreId } = await fx.restores.preview(token, backupPath);

      await expectCode(
        fx.restores.restoreOver(token, '00000000-0000-4000-8000-000000000000', noProgress),
        'backup.restore_expired',
      );
      // Used once: it cannot be restored twice.
      await fx.restores
        .restoreOver(token, restoreId, noProgress)
        .then(({ token: newToken }) =>
          expectCode(
            fx.restores.restoreOver(newToken, restoreId, noProgress),
            'backup.restore_expired',
          ),
        );
    });

    it('reports a stale session before reading anything', async () => {
      fx.sessions.close(token);

      await expect(fx.restores.preview(token, backupPath)).rejects.toMatchObject({
        code: 'session.stale',
      });
    });

    it('refuses a file that is not a backup already when previewing it', async () => {
      await expectCode(
        fx.restores.preview(token, writeFile(fx.scratchDir, 'texto.zip', Buffer.from('hola'))),
        'backup.invalid_file',
      );
    });
  });

  describe('removeLeftovers', () => {
    it('removes the backups a crash left half extracted, and nothing else', () => {
      const leftover = fx.paths.restoringDir('11111111-1111-4111-8111-111111111111');
      mkdirSync(join(leftover, 'media'), { recursive: true });

      fx.restores.removeLeftovers();

      expect(readdirSync(fx.paths.profilesDir)).toEqual([profileId]);
    });
  });
});
