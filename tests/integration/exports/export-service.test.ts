import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../src/core/errors';
import { EMPTY_ITEM_DRAFT, type ItemDraft } from '../../../src/core/items/item-draft';
import type { ItemKind } from '../../../src/shared/content';
import type { ExportTarget, LibraryExportFile } from '../../../src/shared/exports';
import { parseCsv } from '../../support/csv';
import { pngImage, writeFile } from '../../support/media-files';
import {
  createProfileFixture,
  FIXTURE_APP_VERSION,
  type ProfileFixture,
} from '../../support/profile-fixture';

const JSON_TARGET: ExportTarget = { format: 'json' };
const csv = (kind: ItemKind, separator: ';' | ',' = ';'): ExportTarget => ({
  format: 'csv',
  kind,
  separator,
});
const named = (name: string) => ({ kind: 'new' as const, name });

const FULL_GAME: ItemDraft = {
  ...EMPTY_ITEM_DRAFT,
  title: 'Okami; "HD", edición',
  alternateTitles: ['大神', 'a|b'],
  description: 'Primera línea\nSegunda línea',
  notes: '=1+1',
  isFavorite: true,
  rating: 9,
  status: 'completed',
  isReplay: true,
  ownsPhysical: true,
  startedOn: { kind: 'known', date: { year: 2021, month: 3 } },
  finishedOn: { kind: 'unknown' },
  minutesPlayed: 2730,
  // Not in alphabetical order: the chosen one is kept.
  relations: { genre: [named('Zen'), named('Acuarela')], tag: [named('Arte')] },
  releases: [
    { region: named('Nipón'), date: { year: 2006, month: 4, day: 20 } },
    { region: null, date: { year: 2007 } },
  ],
};

describe('ExportService', () => {
  let fx: ProfileFixture;
  let profileId: string;
  let token: string;
  let outDir: string;

  const add = (kind: ItemKind, draft: Partial<ItemDraft>) =>
    fx.items.create(token, kind, { ...EMPTY_ITEM_DRAFT, ...draft }).id;

  async function exportText(target: ExportTarget, fileName = 'export.out'): Promise<string> {
    const destination = join(outDir, fileName);
    await fx.exports.exportForSession(token, target, destination);
    return readFileSync(destination, 'utf8');
  }

  const exportJson = async () => JSON.parse(await exportText(JSON_TARGET)) as LibraryExportFile;

  /** The rows of a CSV export, by the label of their column. */
  async function exportRows(target: ExportTarget & { format: 'csv' }) {
    const text = await exportText(target);
    expect(text.startsWith('\u{FEFF}')).toBe(true);
    const [header, ...rows] = parseCsv(text.slice(1), target.separator);
    return rows.map((row) => {
      expect(row).toHaveLength(header!.length);
      return Object.fromEntries(row.map((cell, index) => [header![index]!, cell]));
    });
  }

  beforeEach(() => {
    fx = createProfileFixture();
    profileId = fx.profiles.create({ name: 'Ana', language: 'es' }).profile.id;
    token = fx.sessions.open(profileId).token;
    outDir = join(fx.scratchDir, 'exportación ñ');
    mkdirSync(outDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fx.cleanup();
  });

  describe('JSON', () => {
    it('writes every field of an item, naming its catalog values in the chosen order', async () => {
      const id = add('game', FULL_GAME);
      const { createdAt, updatedAt } = fx.items.get(token, id);

      const file = await exportJson();

      expect(file).toMatchObject({
        format: 'keeptomyshelf-library',
        formatVersion: 1,
        appVersion: FIXTURE_APP_VERSION,
        profile: { name: 'Ana' },
      });
      expect(new Date(file.exportedAt).toISOString()).toBe(file.exportedAt);
      const { uuid, ...item } = file.items[0]!;
      expect(uuid).toMatch(/^[0-9a-f-]{36}$/);
      // Exactly these: no internal ids.
      expect(item).toEqual({
        kind: 'game',
        title: 'Okami; "HD", edición',
        placeholderNumber: null,
        alternateTitles: ['大神', 'a|b'],
        description: 'Primera línea\nSegunda línea',
        notes: '=1+1',
        isFavorite: true,
        rating: 9,
        status: 'completed',
        isReplay: true,
        ownsPhysical: true,
        ownsDigital: false,
        startedOn: '2021-03',
        finishedOn: 'unknown',
        minutesPlayed: 2730,
        seasonsCount: null,
        episodesCount: null,
        relations: { genre: ['Zen', 'Acuarela'], tag: ['Arte'] },
        releases: [
          { region: 'Nipón', date: '2006-04-20' },
          { region: null, date: '2007' },
        ],
        createdAt,
        updatedAt,
        deletedAt: null,
      });
    });

    it('is UTF-8 without a byte order mark', async () => {
      expect((await exportText(JSON_TARGET)).startsWith('{\n')).toBe(true);
    });

    it('includes the trash and the untitled items, by kind and natural order', async () => {
      add('series', { title: 'Lost', seasonsCount: 6, episodesCount: 121 });
      add('game', {});
      add('game', { title: 'Final Fantasy 10' });
      add('game', { title: 'Final Fantasy 2' });
      fx.items.moveToTrash(token, add('movie', { title: 'Alien' }));

      const { items } = await exportJson();

      expect(
        items.map(({ title, placeholderNumber }) => title ?? `Sin nombre ${placeholderNumber}`),
      ).toEqual(['Final Fantasy 2', 'Final Fantasy 10', 'Sin nombre 1', 'Alien', 'Lost']);
      expect(items.map(({ deletedAt }) => deletedAt !== null)).toEqual([
        false,
        false,
        false,
        true,
        false,
      ]);
      expect(items[4]).toMatchObject({ seasonsCount: 6, episodesCount: 121 });
    });

    it('includes every catalog value, also unused, with its aliases and scope', async () => {
      fx.catalogs.create(token, 'tag', { name: 'Sin usar', aliases: ['B', 'A'], scope: null });
      fx.catalogs.create(token, 'screen_genre', { name: 'Raro', aliases: [], scope: 'series' });
      const total = fx.sessions
        .require(token)
        .db.prepare('SELECT COUNT(*) FROM catalog_entry')
        .pluck()
        .get();

      const { catalogs } = await exportJson();

      expect(catalogs).toHaveLength(total as number);
      expect(catalogs).toContainEqual({
        catalog: 'tag',
        name: 'Sin usar',
        aliases: ['B', 'A'],
        scope: null,
      });
      expect(catalogs).toContainEqual({
        catalog: 'screen_genre',
        name: 'Raro',
        aliases: [],
        scope: 'series',
      });
    });

    it('includes the collections, also the empty ones, with the items in the trash', async () => {
      const game = add('game', { title: 'Okami' });
      const movie = add('movie', { title: 'Alien' });
      const collection = fx.collections.create(token, { name: 'Mixta' });
      fx.collections.create(token, { name: 'Vacía' });
      fx.collections.changeMemberships(token, {
        add: [{ collectionId: collection.id, itemId: movie }],
        remove: [],
      });
      fx.collections.changeMemberships(token, {
        add: [{ collectionId: collection.id, itemId: game }],
        remove: [],
      });
      fx.items.moveToTrash(token, game);

      const { collections, items } = await exportJson();

      const uuidOf = (title: string) => items.find((item) => item.title === title)!.uuid;
      expect(collections.map(({ name }) => name)).toEqual(['Mixta', 'Vacía']);
      expect(collections[0]!.items.map(({ uuid }) => uuid)).toEqual([
        uuidOf('Alien'),
        uuidOf('Okami'),
      ]);
      expect(collections[0]!.items[0]!.addedAt < collections[0]!.items[1]!.addedAt).toBe(true);
      expect(Object.keys(collections[0]!).sort()).toEqual(
        ['createdAt', 'items', 'name', 'updatedAt', 'uuid'].sort(),
      );
      expect(collections[1]!.items).toEqual([]);
    });

    it('says nothing about images', async () => {
      const image = await fx.media.prepareImport(
        token,
        writeFile(fx.scratchDir, 'cover.png', await pngImage(40, 40)),
      );
      fx.items.create(
        token,
        'game',
        { ...EMPTY_ITEM_DRAFT, title: 'Okami' },
        { cover: { kind: 'prepared', preparedId: image.id, choice: 'original' } },
      );
      const sha = fx.sessions
        .require(token)
        .db.prepare('SELECT sha256 FROM media_file')
        .pluck()
        .get() as string;

      const text = await exportText(JSON_TARGET);

      expect(text).toContain('Okami');
      expect(text).not.toContain(sha);
      expect(text).not.toContain('cover');
    });
  });

  describe('CSV', () => {
    it('writes the items of one kind, without the trash, in the language of the profile', async () => {
      const game = add('game', FULL_GAME);
      add('movie', { title: 'Alien' });
      fx.items.moveToTrash(token, add('game', { title: 'Borrado' }));
      const collection = fx.collections.create(token, { name: 'Clásicos' });
      fx.collections.changeMemberships(token, {
        add: [{ collectionId: collection.id, itemId: game }],
        remove: [],
      });

      const rows = await exportRows({ format: 'csv', kind: 'game', separator: ';' });

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        Título: 'Okami; "HD", edición',
        'Títulos alternativos': '大神 | a\\|b',
        Estado: 'Terminado',
        Valoración: '4,5',
        Formato: 'Físico',
        Inicio: '2021-03',
        Fin: 'Indeterminada',
        'Horas jugadas': '45:30',
        'Fechas de lanzamiento': 'Nipón: 2006-04-20 | 2007',
        Géneros: 'Zen | Acuarela',
        Descripción: 'Primera línea\nSegunda línea',
        Notas: "'=1+1",
        Colecciones: 'Clásicos',
      });
    });

    it('follows the language of the profile and the separator chosen', async () => {
      add('series', { title: 'Lost', rating: 7, seasonsCount: 6, status: 'abandoned' });
      fx.settings.setForProfile(profileId, { key: 'language', value: 'en' });

      const rows = await exportRows({ format: 'csv', kind: 'series', separator: ',' });

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        Title: 'Lost',
        Rating: '3.5',
        Seasons: '6',
        Status: 'Abandoned',
      });
    });

    it('writes only the header when there is nothing', async () => {
      const text = await exportText(csv('movie'));
      expect(parseCsv(text.slice(1), ';')).toHaveLength(1);
    });
  });

  it('says the name of the file and how many items it has', async () => {
    add('game', { title: 'Okami' });
    fx.items.moveToTrash(token, add('game', { title: 'Borrado' }));
    const save = (target: ExportTarget, name: string) =>
      fx.exports.exportForSession(token, target, join(outDir, name));

    expect(await save(JSON_TARGET, 'a.json')).toEqual({ fileName: 'a.json', items: 2 });
    expect(await save(csv('game'), 'b.csv')).toEqual({ fileName: 'b.csv', items: 1 });
    expect(readdirSync(outDir).sort()).toEqual(['a.json', 'b.csv']);
  });

  it('suggests a name in the language of the profile', () => {
    expect(fx.exports.suggestedFileName(token, csv('movie'))).toMatch(
      /^KeepToMyShelf - Ana - Películas - \d{4}-\d{2}-\d{2} \d{2}-\d{2}\.csv$/,
    );
  });

  it('replaces an older file', async () => {
    writeFileSync(join(outDir, 'export.out'), 'old');
    expect(await exportText(JSON_TARGET)).not.toContain('old');
    expect(readdirSync(outDir)).toEqual(['export.out']);
  });

  it('fails without leaving anything behind when the file cannot be written', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    // A folder cannot be replaced by a file: this fails at the last step, the rename.
    mkdirSync(join(outDir, 'taken', 'inside'), { recursive: true });
    for (const destination of [join(outDir, 'taken'), join(outDir, 'missing', 'a.json')]) {
      const error: unknown = await fx.exports
        .exportForSession(token, JSON_TARGET, destination)
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('export.write_failed');
    }
    expect(logged).toHaveBeenCalledTimes(2);
    expect(readdirSync(outDir)).toEqual(['taken']);
    expect(readdirSync(join(outDir, 'taken'))).toEqual(['inside']);
  });

  it('refuses a stale session, and writes nothing', async () => {
    fx.sessions.close(token);
    expect(() => fx.exports.suggestedFileName(token, JSON_TARGET)).toThrow(AppError);
    await expect(
      fx.exports.exportForSession(token, JSON_TARGET, join(outDir, 'a.json')),
    ).rejects.toThrow(AppError);
    expect(readdirSync(outDir)).toEqual([]);
  });
});
