import { describe, expect, it } from 'vitest';
import en from '../../renderer/i18n/locales/en.json';
import es from '../../renderer/i18n/locales/es.json';
import { ITEM_KINDS, type ItemKind } from '../../shared/content';
import type { ExportedItem } from '../../shared/exports';
import type { Language } from '../../shared/settings';
import { ITEM_STATUSES } from '../items/item-draft';
import { rolesForKind } from '../catalogs/catalogs';
import {
  csvColumns,
  FORMAT_LABELS,
  statusLabel,
  UNKNOWN_DATE_LABEL,
  type CsvContext,
} from './csv-columns';

const LOCALES = { es, en };
const LANGUAGES: Language[] = ['es', 'en'];

const EMPTY: ExportedItem = {
  uuid: 'u',
  kind: 'game',
  title: null,
  placeholderNumber: 3,
  alternateTitles: [],
  description: null,
  notes: null,
  isFavorite: false,
  rating: null,
  status: null,
  isReplay: false,
  ownsPhysical: false,
  ownsDigital: false,
  startedOn: null,
  finishedOn: null,
  minutesPlayed: null,
  seasonsCount: null,
  episodesCount: null,
  relations: {},
  releases: [],
  createdAt: '2026-11-25T12:00:00.000Z',
  updatedAt: '2026-11-25T12:00:00.000Z',
  deletedAt: null,
};

const CONTEXT: CsvContext = { language: 'es', separator: ';', collections: [] };

/** The cells of an item, by column id. */
function cells(item: Partial<ExportedItem>, kind: ItemKind = 'game', context = CONTEXT) {
  const full = { ...EMPTY, kind, ...item };
  return Object.fromEntries(csvColumns(kind).map(({ id, value }) => [id, value(full, context)]));
}

describe('csvColumns', () => {
  it('gives each kind its own columns', () => {
    const ids = (kind: ItemKind) => csvColumns(kind).map(({ id }) => id);
    expect(ids('game')).toEqual([
      'title',
      'alternateTitles',
      'status',
      'isReplay',
      'isFavorite',
      'rating',
      'format',
      'startedOn',
      'finishedOn',
      'hoursPlayed',
      'releases',
      ...rolesForKind('game'),
      'description',
      'notes',
      'collections',
      'addedOn',
    ]);
    expect(ids('movie')).not.toContain('hoursPlayed');
    expect(ids('movie')).not.toContain('seasons');
    expect(ids('series')).toEqual(expect.arrayContaining(['seasons', 'episodes', 'actor']));
  });

  it.each(ITEM_KINDS)('never repeats a label (%s)', (kind) => {
    for (const language of LANGUAGES) {
      const labels = csvColumns(kind).map(({ label }) => label[language]);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it.each(LANGUAGES)('names everything as the app does (%s)', (language) => {
    const { items, collections } = LOCALES[language];
    for (const kind of ITEM_KINDS) {
      const gender = kind === 'game' ? 'game' : 'screen';
      const labels = Object.fromEntries(
        csvColumns(kind).map(({ id, label }) => [id, label[language]]),
      );
      const expected: Record<string, string> = {
        title: items.fields.title,
        alternateTitles: items.fields.alternateTitles,
        status: items.fields.status,
        isReplay: items.replay[gender],
        isFavorite: items.fields.favorite,
        rating: items.rating.label,
        format: items.fields.format,
        startedOn: items.dates.start,
        finishedOn: items.dates.end,
        releases: items.releases[gender],
        description: items.fields.description,
        notes: items.fields.notes,
        collections: collections.title,
        addedOn: items.fields.addedOn,
      };
      if (kind === 'game') expected['hoursPlayed'] = items.fields.hoursPlayed;
      if (kind === 'series') {
        expected['seasons'] = items.fields.seasons;
        expected['episodes'] = items.fields.episodes;
      }
      for (const role of rolesForKind(kind)) expected[role] = items.roles[role];
      expect(labels).toEqual(expected);
      for (const status of ITEM_STATUSES) {
        expect(statusLabel(kind, status)[language]).toBe(items.status[gender][status]);
      }
    }
    for (const format of ['physical', 'digital', 'both'] as const) {
      expect(FORMAT_LABELS[format][language]).toBe(items.format[format]);
    }
    expect(UNKNOWN_DATE_LABEL[language]).toBe(items.dates.unknown);
  });

  it('leaves what is not known empty, also the title of an untitled item', () => {
    const { isReplay, isFavorite, addedOn, ...rest } = cells({});
    expect([isReplay, isFavorite, addedOn]).toEqual(['No', 'No', '2026-11-25']);
    expect(new Set(Object.values(rest))).toEqual(new Set(['']));
  });

  it('writes every value', () => {
    const item: Partial<ExportedItem> = {
      title: 'Okami',
      alternateTitles: ['大神', 'a|b'],
      status: 'completed',
      isReplay: true,
      isFavorite: true,
      rating: 9,
      ownsPhysical: true,
      ownsDigital: true,
      startedOn: '2021-03',
      finishedOn: 'unknown',
      minutesPlayed: 2730,
      releases: [
        { region: 'Japón', date: '2006-04-20' },
        { region: null, date: '2007' },
      ],
      relations: { genre: ['Aventura', 'Acción'] },
      description: 'Una loba.',
      notes: 'Notas',
    };
    expect(cells(item, 'game', { ...CONTEXT, collections: ['Clásicos', 'Zen'] })).toMatchObject({
      title: 'Okami',
      alternateTitles: '大神 | a\\|b',
      status: 'Terminado',
      isReplay: 'Sí',
      isFavorite: 'Sí',
      rating: '4,5',
      format: 'Ambos',
      startedOn: '2021-03',
      finishedOn: 'Indeterminada',
      hoursPlayed: '45:30',
      releases: 'Japón: 2006-04-20 | 2007',
      genre: 'Aventura | Acción',
      tag: '',
      description: 'Una loba.',
      notes: 'Notas',
      collections: 'Clásicos | Zen',
    });
    expect(cells(item, 'movie', { ...CONTEXT, language: 'en', separator: ',' })).toMatchObject({
      status: 'Completed',
      isReplay: 'Yes',
      rating: '4.5',
      format: 'Both',
      finishedOn: 'Unknown',
    });
    expect(cells({ seasonsCount: 0, episodesCount: 24 }, 'series')).toMatchObject({
      seasons: '0',
      episodes: '24',
    });
  });

  it('gives the day an item was added in local time', () => {
    const lateAtNight = new Date(2026, 0, 5, 23, 59);
    const early = new Date(2026, 0, 5, 0, 1);
    for (const date of [lateAtNight, early]) {
      expect(cells({ createdAt: date.toISOString() })['addedOn']).toBe('2026-01-05');
    }
  });
});
