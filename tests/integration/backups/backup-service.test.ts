import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../../../src/core/errors';
import { EMPTY_ITEM_DRAFT } from '../../../src/core/items/item-draft';
import {
  AUTOMATIC_BACKUPS_KEPT,
  BackupService,
} from '../../../src/main/application/backup-service';
import { openDatabase } from '../../../src/main/infrastructure/db/connection';
import { libraryMigrations } from '../../../src/main/infrastructure/db/migrations/library';
import { MediaStore } from '../../../src/main/infrastructure/media/media-store';
import type { BackupManifest, BackupProgress } from '../../../src/shared/backups';
import { PDF_BYTES, pngImage, writeFile } from '../../support/media-files';
import {
  createProfileFixture,
  FIXTURE_APP_VERSION,
  type ProfileFixture,
} from '../../support/profile-fixture';
import { readZip } from '../../support/zip';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function expectCode(running: Promise<unknown>, code: string): Promise<void> {
  const error: unknown = await running.then(
    () => expect.fail(`Expected error "${code}"`),
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
}

describe('BackupService', () => {
  let fx: ProfileFixture;
  let profileId: string;
  let token: string;
  let outDir: string;
  let image: Buffer;

  const store = () => new MediaStore(fx.paths.mediaDir(profileId), fx.paths.cacheDir(profileId));
  const noProgress = () => {};

  /** An item whose cover is an optimized copy with its original kept, plus a PDF. */
  async function addItemWithMedia(title: string): Promise<number> {
    const cover = await fx.media.prepareImport(token, writeFile(fx.scratchDir, 'cover.png', image));
    const document = await fx.media.prepareImport(
      token,
      writeFile(fx.scratchDir, 'Manual.pdf', PDF_BYTES),
    );
    return fx.items.create(
      token,
      'game',
      { ...EMPTY_ITEM_DRAFT, title },
      {
        cover: { kind: 'prepared', preparedId: cover.id, choice: 'optimized_with_original' },
        documents: [{ kind: 'prepared', preparedId: document.id, label: 'Manual' }],
      },
    ).id;
  }

  /** Every stored file of the profile, as its path inside a backup. */
  function storedFilesAsZipNames(): string[] {
    const db = fx.sessions.require(token).db;
    const rows = db.prepare('SELECT sha256, store, format FROM media_file').all() as {
      sha256: string;
      store: 'files' | 'originals';
      format: 'png' | 'webp' | 'pdf';
    }[];
    return rows.map((row) => {
      const path = store().filePath(row.store, row.sha256, row.format);
      return `media/${row.store}/${row.sha256.slice(0, 2)}/${path.split(/[\\/]/).pop()}`;
    });
  }

  beforeEach(async () => {
    fx = createProfileFixture();
    profileId = fx.profiles.create({ name: 'Ana', language: 'en' }).profile.id;
    token = fx.sessions.open(profileId).token;
    outDir = join(fx.scratchDir, 'copias ñ');
    mkdirSync(outDir);
    image ??= await pngImage(2400, 1200);
  });

  afterEach(() => {
    fx.cleanup();
  });

  describe('createForSession', () => {
    it('writes the manifest, a snapshot of the library and the stored files, without thumbnails', async () => {
      await addItemWithMedia('Chrono Trigger');
      const destination = join(outDir, 'Copia de Ana.zip');

      const saved = await fx.backups.createForSession(token, destination, noProgress);

      const entries = await readZip(destination);
      const mediaNames = storedFilesAsZipNames();
      expect(mediaNames).toHaveLength(3); // optimized copy, its original and the PDF
      expect([...entries.keys()].sort()).toEqual(
        ['library.db', 'manifest.json', ...mediaNames].sort(),
      );
      expect(saved).toEqual({ fileName: 'Copia de Ana.zip', files: 3, missing: 0 });

      // Each stored file is there byte for byte (its name is its hash), stored as it is.
      for (const name of mediaNames) {
        const entry = entries.get(name)!;
        expect(name).toContain(sha256(entry.bytes));
        expect(entry.compressed).toBe(false);
      }
      expect(entries.get('library.db')!.compressed).toBe(true);

      const manifest = JSON.parse(
        entries.get('manifest.json')!.bytes.toString('utf8'),
      ) as BackupManifest;
      expect(manifest).toMatchObject({
        format: 'keeptomyshelf-backup',
        formatVersion: 1,
        appVersion: FIXTURE_APP_VERSION,
        reason: 'manual',
        profile: { name: 'Ana', createdAt: fx.profiles.get(profileId).createdAt },
        librarySchemaVersion: libraryMigrations.length,
        // Only its own preferences: the language chosen when it was created.
        settings: { language: 'en' },
        media: { files: 3, missing: 0 },
      });
      expect(manifest.media.bytes).toBeGreaterThan(0);

      // The snapshot is a complete library.
      const snapshotPath = join(fx.scratchDir, 'library.db');
      writeFileSync(snapshotPath, entries.get('library.db')!.bytes);
      const snapshot = openDatabase(snapshotPath);
      try {
        expect(snapshot.pragma('integrity_check', { simple: true })).toBe('ok');
        expect(snapshot.prepare('SELECT title FROM item').pluck().all()).toEqual([
          'Chrono Trigger',
        ]);
      } finally {
        snapshot.close();
      }
    });

    it('leaves out a file deleted by hand and says so', async () => {
      await addItemWithMedia('Chrono Trigger');
      const db = fx.sessions.require(token).db;
      const pdf = db
        .prepare("SELECT sha256, format FROM media_file WHERE kind = 'document'")
        .get() as { sha256: string; format: 'pdf' };
      rmSync(store().filePath('files', pdf.sha256, pdf.format));
      const destination = join(outDir, 'copia.zip');

      const saved = await fx.backups.createForSession(token, destination, noProgress);

      expect(saved).toMatchObject({ files: 2, missing: 1 });
      const names = [...(await readZip(destination)).keys()];
      expect(names.some((name) => name.includes(pdf.sha256))).toBe(false);
    });

    it('reports its progress up to the whole size', async () => {
      await addItemWithMedia('Chrono Trigger');
      const progress: BackupProgress[] = [];

      await fx.backups.createForSession(token, join(outDir, 'copia.zip'), (step) =>
        progress.push(step),
      );

      expect(progress[0]?.doneBytes).toBe(0);
      const last = progress.at(-1)!;
      expect(last.doneBytes).toBe(last.totalBytes);
      const done = progress.map((step) => step.doneBytes);
      expect(done).toEqual([...done].sort((a, b) => a - b));
    });

    it('keeps the files the backup still has to read until it ends', async () => {
      const itemId = await addItemWithMedia('Chrono Trigger');
      const coverFiles = storedFilesAsZipNames().filter((name) => !name.endsWith('.pdf'));
      const destination = join(outDir, 'copia.zip');

      const writing = fx.backups.createForSession(token, destination, noProgress);
      // Removing the cover while the backup is written: its files are no longer used.
      fx.items.update(
        token,
        itemId,
        { ...EMPTY_ITEM_DRAFT, title: 'Chrono Trigger' },
        {
          cover: null,
        },
      );
      const onDisk = () => store().listStoredFiles().length;
      expect(onDisk()).toBe(3);
      await writing;

      // The backup has them, and the sweep put off meanwhile removed them afterwards.
      const names = [...(await readZip(destination)).keys()];
      for (const name of coverFiles) expect(names).toContain(name);
      expect(onDisk()).toBe(1);
    });

    it('writes only one backup at a time', async () => {
      const first = fx.backups.createForSession(token, join(outDir, 'una.zip'), noProgress);

      await expectCode(
        fx.backups.createForSession(token, join(outDir, 'otra.zip'), noProgress),
        'backup.busy',
      );
      await first;
      expect(readdirSync(outDir)).toEqual(['una.zip']);
    });

    it('fails without leaving anything behind when the file cannot be written', async () => {
      const destination = join(outDir, 'no existe', 'copia.zip');

      await expectCode(
        fx.backups.createForSession(token, destination, noProgress),
        'backup.write_failed',
      );

      expect(readdirSync(outDir)).toEqual([]);
      expect(readdirSync(fx.paths.backupsDir)).toEqual([]);
    });

    it('needs the open session', async () => {
      fx.sessions.close(token);

      await expect(
        fx.backups.createForSession(token, join(outDir, 'copia.zip'), noProgress),
      ).rejects.toMatchObject({ code: 'session.stale' });
    });
  });

  describe('suggestedFileName', () => {
    it('names the backup after the profile and the time', () => {
      expect(fx.backups.suggestedFileName(token)).toMatch(
        /^KeepToMyShelf - Ana - \d{4}-\d{2}-\d{2} \d{2}-\d{2}\.zip$/,
      );
    });
  });

  describe('createBeforeDelete', () => {
    it('saves a backup of a closed profile in the backups folder', async () => {
      await addItemWithMedia('Chrono Trigger');
      fx.sessions.close(token);

      const path = await fx.backups.createBeforeDelete(profileId, noProgress);

      expect(path).toMatch(/ - Ana - before-delete\.zip$/);
      const entries = await readZip(path!);
      expect(entries.size).toBe(5);
      const manifest = JSON.parse(
        entries.get('manifest.json')!.bytes.toString('utf8'),
      ) as BackupManifest;
      expect(manifest.reason).toBe('before-delete');
    });

    it(`keeps only the ${AUTOMATIC_BACKUPS_KEPT} most recent automatic backups`, async () => {
      fx.sessions.close(token);
      mkdirSync(fx.paths.backupsDir, { recursive: true });
      // Files that are not automatic backups are never removed.
      const others = ['mía.zip', 'app-v1-2026-10-21T15-02-18-123Z.db'];
      for (const name of others) writeFileSync(join(fx.paths.backupsDir, name), 'x');

      const made: string[] = [];
      for (let index = 0; index < AUTOMATIC_BACKUPS_KEPT + 2; index++) {
        made.push((await fx.backups.createBeforeDelete(profileId, noProgress))!);
      }

      const kept = made.slice(2).map((path) => path.split(/[\\/]/).pop());
      expect(readdirSync(fx.paths.backupsDir).sort()).toEqual([...kept, ...others].sort());
    });
  });

  describe('removeLeftovers', () => {
    it('removes what an interrupted backup left in the backups folder, and nothing else', () => {
      mkdirSync(join(fx.paths.backupsDir, '.tmp', 'abc'), { recursive: true });
      writeFileSync(join(fx.paths.backupsDir, 'copia.zip.1234.partial'), 'x');
      writeFileSync(join(fx.paths.backupsDir, 'copia.zip'), 'x');

      fx.backups.removeLeftovers();

      expect(readdirSync(fx.paths.backupsDir)).toEqual(['copia.zip']);
    });

    it('does nothing when there is no backups folder', () => {
      fx.backups.removeLeftovers();

      expect(existsSync(fx.paths.backupsDir)).toBe(false);
    });
  });

  describe('openAutomaticFolder', () => {
    it('opens the backups folder, creating it if needed', async () => {
      await fx.backups.openAutomaticFolder();

      expect(fx.openedFolders).toEqual([fx.paths.backupsDir]);
      expect(existsSync(fx.paths.backupsDir)).toBe(true);
    });

    it('reports a folder the system could not open', async () => {
      const backups = new BackupService({
        appDb: fx.appDb,
        paths: fx.paths,
        sessions: fx.sessions,
        settings: fx.settings,
        media: fx.media,
        appVersion: FIXTURE_APP_VERSION,
        now: () => new Date(),
        openFolder: () => Promise.resolve('Access denied'),
      });

      await expectCode(backups.openAutomaticFolder(), 'backup.open_folder_failed');
    });
  });
});
