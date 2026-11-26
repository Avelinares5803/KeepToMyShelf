import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../src/core/errors';
import { EMPTY_ITEM_DRAFT, type ItemDraft } from '../../../src/core/items/item-draft';
import { BackupLock } from '../../../src/main/application/backup-lock';
import { ImportService } from '../../../src/main/application/import-service';
import type { ItemKind } from '../../../src/shared/content';
import type { LibraryExportFile } from '../../../src/shared/exports';
import type { ImportCheck, ImportPreview } from '../../../src/shared/imports';
import { createProfileFixture, type ProfileFixture } from '../../support/profile-fixture';

const named = (name: string) => ({ kind: 'new' as const, name });

const FULL_GAME: ItemDraft = {
  ...EMPTY_ITEM_DRAFT,
  title: 'Okami',
  alternateTitles: ['大神'],
  description: 'Primera línea\nSegunda línea',
  notes: 'Notas',
  isFavorite: true,
  rating: 9,
  status: 'completed',
  isReplay: true,
  ownsPhysical: true,
  startedOn: { kind: 'known', date: { year: 2021, month: 3 } },
  finishedOn: { kind: 'unknown' },
  minutesPlayed: 2730,
  relations: { genre: [named('Zen'), named('Acuarela')], owned_on: [named('PS2')] },
  releases: [
    { region: named('Nipón'), date: { year: 2006, month: 4, day: 20 } },
    { region: null, date: { year: 2007 } },
  ],
};

describe('ImportService', () => {
  let fx: ProfileFixture;
  /** The profile the file comes from. */
  let source: string;
  /** The profile it is imported into, which is open. */
  let token: string;

  const add = (kind: ItemKind, draft: Partial<ItemDraft>, session = source) =>
    fx.items.create(session, kind, { ...EMPTY_ITEM_DRAFT, ...draft }).id;

  const db = () => fx.sessions.require(token).db;
  const count = (table: string) =>
    db().prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get() as number;

  /** Exports the open profile to JSON and returns the file's path and contents. */
  async function exportOpen(session: string, name = 'biblioteca.json') {
    const path = join(fx.scratchDir, name);
    await fx.exports.exportForSession(session, { format: 'json' }, path);
    return { path, file: JSON.parse(readFileSync(path, 'utf8')) as LibraryExportFile };
  }

  function writeJson(file: unknown, name = 'editado.json'): string {
    const path = join(fx.scratchDir, name);
    writeFileSync(path, typeof file === 'string' ? file : JSON.stringify(file));
    return path;
  }

  /** The source library, exported with its profile open; then the target profile is opened. */
  async function exportSourceAndSwitch(): Promise<{ path: string; file: LibraryExportFile }> {
    const exported = await exportOpen(source);
    token = fx.sessions.open(fx.profiles.create({ name: 'Bea', language: 'es' }).profile.id).token;
    return exported;
  }

  function validPreview(check: ImportCheck): ImportPreview {
    if (!check.valid) return expect.fail(`Invalid item: ${JSON.stringify(check.item)}`);
    return check.preview;
  }

  async function importFile(path: string) {
    const preview = validPreview(await fx.imports.preview(token, path));
    return fx.imports.confirm(token, preview.importId, () => {});
  }

  async function errorOf(run: () => Promise<unknown>): Promise<AppError> {
    const error: unknown = await run().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    return error as AppError;
  }

  beforeEach(() => {
    fx = createProfileFixture();
    source = fx.sessions.open(fx.profiles.create({ name: 'Ana', language: 'es' }).profile.id).token;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fx.cleanup();
  });

  it('brings a whole library into an empty profile: exporting both gives the same', async () => {
    add('game', FULL_GAME);
    add('game', {});
    add('series', { title: 'Lost', seasonsCount: 6, episodesCount: 121 });
    const okami = fx.items.list(source, 'game').find(({ title }) => title === 'Okami')!.id;
    const trashed = add('movie', { title: 'Alien', relations: { genre: [named('Terror')] } });
    fx.catalogs.create(source, 'tag', { name: 'Sin usar', aliases: ['B', 'A'], scope: null });
    fx.catalogs.create(source, 'screen_genre', { name: 'Raro', aliases: [], scope: 'series' });
    const mixed = fx.collections.create(source, { name: 'Mixta' });
    fx.collections.create(source, { name: 'Vacía' });
    fx.collections.changeMemberships(source, {
      add: [{ collectionId: mixed.id, itemId: trashed }],
      remove: [],
    });
    fx.collections.changeMemberships(source, {
      add: [{ collectionId: mixed.id, itemId: okami }],
      remove: [],
    });
    fx.items.moveToTrash(source, trashed);
    const { path, file } = await exportSourceAndSwitch();
    const valuesBefore = count('catalog_entry');

    const counts = await importFile(path);

    const { file: again } = await exportOpen(token, 'otra.json');
    expect(again.items).toEqual(file.items);
    // Bea got the same default catalogs as Ana.
    expect(again.catalogs).toEqual(file.catalogs);
    expect(again.collections).toEqual(file.collections);
    expect(counts).toEqual({
      items: 4,
      itemsInTrash: 1,
      existingItems: 0,
      catalogValues: count('catalog_entry') - valuesBefore,
      collections: 2,
      updatedCollections: 0,
      renamedCollections: 0,
      widenedGenres: 0,
    });
  });

  it('counts in the preview exactly what it adds, and changes nothing until confirmed', async () => {
    add('game', FULL_GAME);
    const { path } = await exportSourceAndSwitch();
    const before = count('catalog_entry');

    const preview = validPreview(await fx.imports.preview(token, path));

    expect(count('item')).toBe(0);
    expect(count('catalog_entry')).toBe(before);
    expect(preview).toMatchObject({ fileName: 'biblioteca.json', profileName: 'Ana' });
    const counts = await fx.imports.confirm(token, preview.importId, () => {});
    expect(counts).toEqual(preview.counts);
    expect(count('catalog_entry')).toBe(before + counts.catalogValues);
  });

  it('never changes an item that exists, nor brings it back from the trash', async () => {
    add('game', { title: 'Okami' });
    const { path } = await exportSourceAndSwitch();
    await importFile(path);
    const [imported] = fx.items.list(token, 'game');
    fx.items.update(token, imported!.id, { ...EMPTY_ITEM_DRAFT, title: 'Okami HD' });
    fx.items.moveToTrash(token, imported!.id);

    const preview = validPreview(await fx.imports.preview(token, path));
    await fx.imports.confirm(token, preview.importId, () => {});

    expect(preview.counts).toMatchObject({ items: 0, existingItems: 1 });
    expect(count('item')).toBe(1);
    expect(fx.items.get(token, imported!.id)).toMatchObject({ title: 'Okami HD' });
    expect(fx.items.get(token, imported!.id).deletedAt).not.toBeNull();
  });

  it('keeps the catalog values of the profile as they are', async () => {
    add('game', { title: 'Okami', relations: { tag: [named('Arte')] } });
    fx.catalogs.create(source, 'tag', { name: 'Nueva', aliases: ['Otra'], scope: null });
    const { path } = await exportSourceAndSwitch();
    fx.catalogs.create(token, 'tag', { name: 'Arte', aliases: ['Art'], scope: null });

    await importFile(path);

    const tags = fx.catalogs.list(token, 'tag');
    expect(tags.find(({ name }) => name === 'Arte')).toMatchObject({
      aliases: ['Art'],
      usage: { total: 1 },
    });
    expect(tags.find(({ name }) => name === 'Nueva')).toMatchObject({ aliases: ['Otra'] });
  });

  it('widens a genre limited to movies that the imported series use', async () => {
    add('series', { title: 'Lost', relations: { genre: [named('Melodrama')] } });
    const { path } = await exportSourceAndSwitch();
    const genre = fx.catalogs.create(token, 'screen_genre', {
      name: 'Melodrama',
      aliases: [],
      scope: 'movie',
    });

    const preview = validPreview(await fx.imports.preview(token, path));
    await fx.imports.confirm(token, preview.importId, () => {});

    expect(preview.counts.widenedGenres).toBe(1);
    expect(fx.catalogs.list(token, 'screen_genre').find(({ id }) => id === genre.id)).toMatchObject(
      {
        scope: null,
        usage: { series: 1 },
      },
    );
  });

  it('numbers the untitled items without taking the numbers in use', async () => {
    add('game', {});
    add('game', {});
    const { path } = await exportSourceAndSwitch();
    add('game', {}, token);

    await importFile(path);

    expect(
      fx.items
        .list(token, 'game')
        .map(({ placeholderNumber }) => placeholderNumber)
        .sort(),
    ).toEqual([1, 2, 3]);
  });

  it('adds to a collection that exists the items it lost, and numbers a taken name', async () => {
    const okami = add('game', { title: 'Okami' });
    const favorites = fx.collections.create(source, { name: 'Favoritas' });
    fx.collections.changeMemberships(source, {
      add: [{ collectionId: favorites.id, itemId: okami }],
      remove: [],
    });
    const { path, file } = await exportSourceAndSwitch();
    await importFile(path);
    const [imported] = fx.collections.list(token);
    fx.collections.changeMemberships(token, {
      add: [],
      remove: [{ collectionId: imported!.id, itemId: fx.items.list(token, 'game')[0]!.id }],
    });
    fx.collections.update(token, imported!.id, { name: 'Mis favoritas' });
    fx.collections.create(token, { name: 'Otra' });
    // Another collection (another UUID) whose name is taken here.
    const withAnother = {
      ...file,
      collections: [
        ...file.collections,
        { ...file.collections[0]!, uuid: '00000000-0000-4000-8000-000000000001', name: 'otra' },
      ],
    };

    const counts = await importFile(writeJson(withAnother));

    expect(counts).toMatchObject({
      items: 0,
      collections: 1,
      updatedCollections: 1,
      renamedCollections: 1,
    });
    expect(fx.collections.list(token).map(({ name }) => name)).toEqual(
      expect.arrayContaining(['Mis favoritas', 'Otra', 'otra (1)']),
    );
    expect(fx.collections.memberIds(token, imported!.id)).toHaveLength(1);
  });

  it('says which item is invalid, and imports nothing', async () => {
    add('game', { title: 'Okami' });
    add('game', { title: 'Zelda' });
    const { file } = await exportSourceAndSwitch();
    const edited = {
      ...file,
      items: file.items.map((item, index) => (index === 1 ? { ...item, rating: 0 } : item)),
    };

    const check = await fx.imports.preview(token, writeJson(edited));

    expect(check).toEqual({
      valid: false,
      fileName: 'editado.json',
      item: { position: 2, title: 'Zelda', code: 'item.invalid_rating' },
    });
    expect(count('item')).toBe(0);
  });

  it.each([
    ['text that is not JSON', 'no es JSON'],
    ['JSON of something else', { format: 'otra-cosa', formatVersion: 1 }],
    ['an export without its items', { format: 'keeptomyshelf-library', formatVersion: 1 }],
  ])('refuses %s', async (_, contents) => {
    const error = await errorOf(() => fx.imports.preview(source, writeJson(contents)));
    expect(error.code).toBe('import.invalid_file');
  });

  it('accepts a file that another program saved with a byte order mark', async () => {
    add('game', { title: 'Okami' });
    const { file } = await exportSourceAndSwitch();
    const counts = await importFile(writeJson(`\u{FEFF}${JSON.stringify(file)}`));
    expect(counts.items).toBe(1);
  });

  it('refuses a file of a newer version as such', async () => {
    const { file } = await exportOpen(source);
    const error = await errorOf(() =>
      fx.imports.preview(source, writeJson({ ...file, formatVersion: 2, items: 'nuevo' })),
    );
    expect(error.code).toBe('import.too_new');
  });

  it('refuses a file that is too large or cannot be read', async () => {
    const { path } = await exportOpen(source);
    const small = new ImportService({
      sessions: fx.sessions,
      backups: fx.backups,
      lock: new BackupLock(),
      newId: randomUUID,
      maxBytes: 10,
    });
    expect((await errorOf(() => small.preview(source, path))).code).toBe('import.too_large');
    expect(
      (await errorOf(() => fx.imports.preview(source, join(fx.scratchDir, 'no-existe.json')))).code,
    ).toBe('import.read_failed');
  });

  it('saves an automatic backup first, which counts with the others', async () => {
    add('game', { title: 'Okami' });
    const { path } = await exportSourceAndSwitch();

    await importFile(path);

    expect(readdirSync(fx.paths.backupsDir).filter((name) => name.endsWith('.zip'))).toEqual([
      expect.stringMatching(/ - Bea - before-import\.zip$/),
    ]);
  });

  it('imports nothing if the automatic backup fails', async () => {
    add('game', { title: 'Okami' });
    const { path } = await exportSourceAndSwitch();
    vi.spyOn(fx.backups, 'writeAutomatic').mockRejectedValue(
      new AppError('backup.write_failed', 'Disk full'),
    );
    const preview = validPreview(await fx.imports.preview(token, path));

    const error = await errorOf(() => fx.imports.confirm(token, preview.importId, () => {}));

    expect(error.code).toBe('import.safety_backup_failed');
    expect(count('item')).toBe(0);
  });

  it('imports nothing if something fails half-way', async () => {
    add('game', { title: 'Okami' });
    add('game', { title: 'Zelda' });
    const { path } = await exportSourceAndSwitch();
    const preview = validPreview(await fx.imports.preview(token, path));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    // The second item cannot be written: its UUID appears meanwhile with another kind.
    const zelda = (JSON.parse(readFileSync(path, 'utf8')) as LibraryExportFile).items[1]!;
    db()
      .prepare(
        `CREATE TRIGGER fail BEFORE INSERT ON item WHEN NEW.uuid = '${zelda.uuid}'
         BEGIN SELECT RAISE(ABORT, 'simulated failure'); END`,
      )
      .run();

    const error = await errorOf(() => fx.imports.confirm(token, preview.importId, () => {}));

    expect(error.code).toBe('import.failed');
    expect(logged).toHaveBeenCalledOnce();
    expect(count('item')).toBe(0);
  });

  it('only imports the last file previewed, once, from the session that chose it', async () => {
    add('game', { title: 'Okami' });
    const { path } = await exportSourceAndSwitch();
    const first = validPreview(await fx.imports.preview(token, path));
    const second = validPreview(await fx.imports.preview(token, path));

    expect((await errorOf(() => fx.imports.confirm(token, first.importId, () => {}))).code).toBe(
      'import.expired',
    );
    await fx.imports.confirm(token, second.importId, () => {});
    expect((await errorOf(() => fx.imports.confirm(token, second.importId, () => {}))).code).toBe(
      'import.expired',
    );
    expect(count('item')).toBe(1);
  });

  it('refuses a stale session', async () => {
    const { path } = await exportOpen(source);
    fx.sessions.close(source);
    expect((await errorOf(() => fx.imports.preview(source, path))).code).toBe('session.stale');
  });
});
