import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_ITEM_DRAFT } from '../../../src/core/items/item-draft';
import { BackupLock } from '../../../src/main/application/backup-lock';
import { SCHEDULED_BACKUPS_KEPT } from '../../../src/main/application/backup-service';
import type { BackupManifest } from '../../../src/shared/backups';
import { PDF_BYTES, writeFile } from '../../support/media-files';
import { createProfileFixture, type ProfileFixture } from '../../support/profile-fixture';
import { readZip } from '../../support/zip';

const noProgress = () => {};

describe('scheduled backups', () => {
  let fx: ProfileFixture;
  let profileId: string;
  let token: string;

  const dirOf = (id: string) => fx.paths.scheduledBackupsDir(id);
  const savedOf = (id: string) => (existsSync(dirOf(id)) ? readdirSync(dirOf(id)).sort() : []);
  const saved = () => savedOf(profileId);
  const lastPath = () => join(dirOf(profileId), saved().at(-1)!);

  function addItem(title: string): number {
    return fx.items.create(token, 'game', { ...EMPTY_ITEM_DRAFT, title }).id;
  }

  async function addDocument(title: string, bytes: Uint8Array = PDF_BYTES): Promise<void> {
    const prepared = await fx.media.prepareImport(
      token,
      writeFile(fx.scratchDir, 'Manual.pdf', Buffer.from(bytes)),
    );
    fx.items.create(
      token,
      'game',
      { ...EMPTY_ITEM_DRAFT, title },
      {
        cover: null,
        documents: [{ kind: 'prepared', preparedId: prepared.id, label: 'Manual' }],
      },
    );
  }

  /** A large PDF, so that its backup is still being written when something else starts. */
  const addLargeDocument = (title: string) =>
    addDocument(title, Buffer.concat([PDF_BYTES, Buffer.alloc(40 * 1024 * 1024, title)]));

  /** Resolves when the backup is being written (its .partial has appeared). */
  const untilWriting = (id: string) =>
    vi.waitFor(() => expect(savedOf(id)).toEqual([expect.stringMatching(/\.partial$/)]), {
      interval: 1,
    });

  beforeEach(() => {
    fx = createProfileFixture();
    profileId = fx.profiles.create({ name: 'Ana', language: 'en' }).profile.id;
    token = fx.sessions.open(profileId).token;
    addItem('Chrono Trigger');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fx.cleanup();
  });

  describe('when one is due', () => {
    it('waits a week from the creation of the profile, by default', async () => {
      fx.advanceDays(6);
      await fx.scheduledBackups.runDue();
      expect(saved()).toEqual([]);
      expect(fx.backups.lastScheduledAt(profileId)).toBeNull();

      fx.advanceDays(1);
      await fx.scheduledBackups.runDue();

      expect(saved()).toEqual([expect.stringMatching(/ - Ana - scheduled\.zip$/)]);
      expect(fx.backups.lastScheduledAt(profileId)).toBeInstanceOf(Date);
      const manifest = JSON.parse(
        (await readZip(lastPath())).get('manifest.json')!.bytes.toString('utf8'),
      ) as BackupManifest;
      expect(manifest).toMatchObject({ reason: 'scheduled', profile: { name: 'Ana' } });
      expect(fx.scheduledFailures).toEqual([]);
    });

    it('then counts from the last one', async () => {
      fx.advanceDays(7);
      await fx.scheduledBackups.runDue();
      addItem('Zelda');

      fx.advanceDays(6);
      await fx.scheduledBackups.runDue();
      expect(saved()).toHaveLength(1);

      fx.advanceDays(1);
      await fx.scheduledBackups.runDue();
      expect(saved()).toHaveLength(2);
    });

    it('follows the preference of the profile', async () => {
      fx.settings.setForProfile(profileId, { key: 'backupSchedule', value: 'never' });
      fx.advanceDays(400);
      await fx.scheduledBackups.runDue();
      expect(saved()).toEqual([]);

      fx.settings.setForProfile(profileId, { key: 'backupSchedule', value: 'daily' });
      await fx.scheduledBackups.runDue();
      expect(saved()).toHaveLength(1);
    });

    it('does nothing without an open profile', async () => {
      fx.sessions.close(token);
      fx.advanceDays(30);

      await fx.scheduledBackups.runDue();

      expect(saved()).toEqual([]);
    });

    it('is not put off by one dated in the future', async () => {
      mkdirSync(dirOf(profileId), { recursive: true });
      writeFileSync(join(dirOf(profileId), '2099-01-01 10-00-00 - Ana - scheduled.zip'), 'x');
      fx.advanceDays(7);

      await fx.scheduledBackups.runDue();

      expect(saved()).toHaveLength(2);
      expect(fx.backups.lastScheduledAt(profileId)!.getFullYear()).toBe(2026);
    });
  });

  describe('when nothing changed since the last one', () => {
    beforeEach(async () => {
      await addDocument('Metroid');
      fx.advanceDays(7);
      await fx.scheduledBackups.runDue();
      expect(saved()).toHaveLength(1);
      fx.advanceDays(7);
    });

    it('is left out, also after opening the profile again', async () => {
      token = fx.sessions.open(profileId).token;

      await fx.scheduledBackups.runDue();

      expect(saved()).toHaveLength(1);
      expect(readdirSync(fx.paths.backupsDir)).toEqual(['scheduled']);
    });

    it.each<[string, () => void]>([
      ['an item is added', () => void addItem('Zelda')],
      [
        'an item changes but not its size',
        () => {
          fx.sessions.require(token).db.prepare("UPDATE item SET title = 'Chrono Trigged'").run();
        },
      ],
      [
        'a preference changes',
        () => fx.settings.setForProfile(profileId, { key: 'theme', value: 'dark' }),
      ],
      ['the profile is renamed', () => void fx.profiles.rename(profileId, 'Bea')],
      [
        'a stored file is deleted by hand',
        () => rmSync(join(fx.paths.mediaDir(profileId), 'files'), { recursive: true }),
      ],
    ])('is made if %s', async (_name, change) => {
      change();

      await fx.scheduledBackups.runDue();

      expect(saved()).toHaveLength(2);
      expect(fx.scheduledFailures).toEqual([]);
    });

    it('is made if the last one is damaged', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      writeFileSync(lastPath(), readFileSync(lastPath()).subarray(0, 200));

      await fx.scheduledBackups.runDue();

      expect(saved()).toHaveLength(2);
      expect(fx.scheduledFailures).toEqual([]);
    });
  });

  it(`keeps the ${SCHEDULED_BACKUPS_KEPT} most recent of each profile, and nothing else is removed`, async () => {
    // Another profile's, an automatic one and a file of the user are not counted nor touched.
    const otherId = fx.profiles.create({ name: 'Bea' }).profile.id;
    mkdirSync(dirOf(otherId), { recursive: true });
    const old = '2020-01-01 10-00-00 - Bea - scheduled.zip';
    writeFileSync(join(dirOf(otherId), old), 'x');
    const automatic = '2020-01-01 10-00-00 - Ana - before-delete.zip';
    writeFileSync(join(fx.paths.backupsDir, automatic), 'x');
    mkdirSync(dirOf(profileId), { recursive: true });
    writeFileSync(join(dirOf(profileId), 'mía.zip'), 'x');

    const made: string[] = [];
    for (let index = 0; index < SCHEDULED_BACKUPS_KEPT + 2; index++) {
      addItem(`Juego ${index}`);
      fx.advanceDays(7);
      await fx.scheduledBackups.runDue();
      made.push(
        saved()
          .filter((name) => name !== 'mía.zip')
          .at(-1)!,
      );
    }

    expect(saved()).toEqual([...made.slice(2), 'mía.zip']);
    expect(savedOf(otherId)).toEqual([old]);
    expect(existsSync(join(fx.paths.backupsDir, automatic))).toBe(true);
  });

  it('can be restored like any other backup', async () => {
    fx.advanceDays(7);
    await fx.scheduledBackups.runDue();

    const { profile } = await fx.restores.restoreAsNew(lastPath(), noProgress);

    const restored = fx.sessions.open(profile.id).token;
    expect(
      fx.sessions.require(restored).db.prepare('SELECT title FROM item').pluck().all(),
    ).toEqual(['Chrono Trigger']);
  });

  // They write files of 40 MB several times, which takes a slow CI runner over the usual 5 s.
  describe('together with other operations', { timeout: 30_000 }, () => {
    it('gives way to a backup the user asks for, leaving nothing behind', async () => {
      const logged = vi.spyOn(console, 'error');
      await addLargeDocument('Metroid');
      fx.advanceDays(7);
      const running = fx.scheduledBackups.runDue();
      await untilWriting(profileId);
      const destination = join(fx.scratchDir, 'copia.zip');

      await fx.backups.createForSession(token, destination, noProgress);
      await running;

      expect((await readZip(destination)).size).toBe(3);
      expect(saved()).toEqual([]);
      expect(fx.scheduledFailures).toEqual([]);

      // Giving way is not an error.
      expect(logged).not.toHaveBeenCalled();

      // It is tried again later.
      await fx.scheduledBackups.runDue();
      expect(saved()).toHaveLength(1);
    });

    it('gives way to deleting its profile', async () => {
      await addLargeDocument('Metroid');
      fx.advanceDays(7);
      const running = fx.scheduledBackups.runDue();
      await untilWriting(profileId);
      fx.sessions.close(token);

      await fx.profiles.delete(profileId);
      await running;

      expect(fx.profiles.list()).toEqual([]);
      expect(existsSync(dirOf(profileId))).toBe(false);
      expect(fx.scheduledFailures).toEqual([]);
    });

    it('gives way to restoring over its profile', async () => {
      const backup = join(fx.scratchDir, 'copia.zip');
      await fx.backups.createForSession(token, backup, noProgress);
      await addLargeDocument('Metroid');
      fx.advanceDays(7);
      const running = fx.scheduledBackups.runDue();
      await untilWriting(profileId);

      const { restoreId } = await fx.restores.preview(token, backup);
      const restored = await fx.restores.restoreOver(token, restoreId, noProgress);
      await running;

      expect(
        fx.sessions.require(restored.token).db.prepare('SELECT title FROM item').pluck().all(),
      ).toEqual(['Chrono Trigger']);
      expect(fx.scheduledFailures).toEqual([]);
    });

    it('does not start while the user is making a backup', async () => {
      fx.advanceDays(7);
      const manual = fx.backups.createForSession(
        token,
        join(fx.scratchDir, 'copia.zip'),
        noProgress,
      );

      await fx.scheduledBackups.runDue();
      await manual;

      expect(saved()).toEqual([]);
      expect(fx.scheduledFailures).toEqual([]);
    });

    it('goes on if its profile is closed, and then looks at the one open', async () => {
      const otherId = fx.profiles.create({ name: 'Bea' }).profile.id;
      await addLargeDocument('Metroid');
      fx.advanceDays(7);
      const running = fx.scheduledBackups.runDue();
      await untilWriting(profileId);

      fx.sessions.open(otherId);
      await running;

      expect(saved()).toEqual([expect.stringMatching(/ - Ana - scheduled\.zip$/)]);
      expect((await readZip(lastPath())).size).toBe(3);
      expect(savedOf(otherId)).toEqual([expect.stringMatching(/ - Bea - scheduled\.zip$/)]);
    });
  });

  it('tells when it fails, leaves nothing behind and is tried again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // A file where the folder of scheduled backups should be.
    mkdirSync(fx.paths.backupsDir, { recursive: true });
    writeFileSync(fx.paths.scheduledBackupsRoot, 'x');
    fx.advanceDays(7);

    await fx.scheduledBackups.runDue();

    expect(fx.scheduledFailures).toEqual([{ profileName: 'Ana' }]);
    expect(readdirSync(fx.paths.backupsDir)).toEqual(['scheduled']);

    rmSync(fx.paths.scheduledBackupsRoot);
    await fx.scheduledBackups.runDue();
    expect(saved()).toHaveLength(1);
  });

  describe('deleting the profile', () => {
    beforeEach(async () => {
      fx.advanceDays(7);
      await fx.scheduledBackups.runDue();
      expect(saved()).toHaveLength(1);
      fx.sessions.close(token);
    });

    it('removes its scheduled backups once its automatic backup is saved', async () => {
      await fx.profiles.delete(profileId);

      expect(readdirSync(fx.paths.scheduledBackupsRoot)).toEqual([]);
      expect(readdirSync(fx.paths.backupsDir)).toContainEqual(
        expect.stringMatching(/ - Ana - before-delete\.zip$/),
      );
    });

    it('keeps them if there was no library left to back up', async () => {
      rmSync(fx.paths.profileDir(profileId), { recursive: true });

      await fx.profiles.delete(profileId);

      expect(fx.profiles.list()).toEqual([]);
      expect(saved()).toHaveLength(1);
    });
  });

  it('cleans up at startup what an interrupted one left, and nothing else', async () => {
    fx.advanceDays(7);
    await fx.scheduledBackups.runDue();
    const [backup] = saved();
    writeFileSync(join(dirOf(profileId), 'copia.zip.1234.partial'), 'x');
    mkdirSync(fx.paths.deletedScheduledBackupsDir(profileId));

    fx.backups.removeLeftovers();

    expect(saved()).toEqual([backup]);
    expect(readdirSync(fx.paths.scheduledBackupsRoot)).toEqual([profileId]);
  });

  it('does not stop the app from starting if its folder cannot be read', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mkdirSync(fx.paths.backupsDir, { recursive: true });
    writeFileSync(fx.paths.scheduledBackupsRoot, 'x');

    expect(() => fx.backups.removeLeftovers()).not.toThrow();
  });

  it("opens the folder of the open profile's scheduled backups, creating it if needed", async () => {
    await fx.backups.openScheduledFolder(token);

    expect(fx.openedFolders).toEqual([dirOf(profileId)]);
    expect(existsSync(dirOf(profileId))).toBe(true);
  });
});

describe('BackupLock', () => {
  it('lets only one of the operations that cancel a background one go on', async () => {
    const lock = new BackupLock();
    let ended = false;
    const background = lock.runInBackground(
      (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () =>
            setTimeout(() => {
              ended = true;
              reject(signal.reason as Error);
            }, 5),
          );
        }),
    );

    // It starts only once the background one has ended.
    const first = lock.run(() => Promise.resolve(ended ? 'after' : 'meanwhile'));

    await expect(lock.run(() => Promise.resolve('second'))).rejects.toMatchObject({
      code: 'backup.busy',
    });
    expect(await lock.runInBackground(() => Promise.resolve())).toBe('busy');
    expect(await first).toBe('after');
    expect(await background).toBe('cancelled');
    // And it is free again.
    expect(await lock.runInBackground(() => Promise.resolve())).toBe('done');
  });
});
