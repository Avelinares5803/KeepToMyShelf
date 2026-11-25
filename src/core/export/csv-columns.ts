import type { ItemKind } from '../../shared/content';
import type { ExportedItem } from '../../shared/exports';
import type { Language } from '../../shared/settings';
import { rolesForKind, type ItemRole } from '../catalogs/catalogs';
import { UNKNOWN_USAGE_DATE, toStoredUsageDate } from '../dates/usage-period';
import { formatDuration } from '../items/duration';
import type { ItemStatus } from '../items/item-draft';
import { toOwnershipFormat, type OwnershipFormat } from '../items/ownership';
import { ratingToStars } from '../items/rating';
import { formatDecimal, joinList, type CsvSeparator } from './csv';

/** A text in each language of the app. */
export type Label = Readonly<Record<Language, string>>;

const label = (es: string, en: string): Label => ({ es, en });

/** Spanish adjectives agree in gender: "terminado" (game), "terminada" (movie, series). */
const byKind = (kind: ItemKind, game: Label, screen: Label) => (kind === 'game' ? game : screen);

const ROLE_LABELS: Readonly<Record<ItemRole, Label>> = {
  franchise: label('Sagas', 'Franchises'),
  owned_on: label('Mis plataformas', 'My platforms'),
  released_on: label('Plataformas de lanzamiento', 'Release platforms'),
  genre: label('Géneros', 'Genres'),
  publisher: label('Distribuidoras', 'Publishers'),
  developer: label('Desarrolladoras', 'Developers'),
  producer: label('Productoras', 'Production companies'),
  director: label('Dirección', 'Directors'),
  actor: label('Reparto', 'Cast'),
  composer: label('Compositores', 'Composers'),
  origin_country: label('Países de origen', 'Countries of origin'),
  tag: label('Etiquetas', 'Tags'),
};

export function statusLabel(kind: ItemKind, status: ItemStatus): Label {
  switch (status) {
    case 'not_started':
      return label('Por empezar', 'Not started');
    case 'in_progress':
      return label('En curso', 'In progress');
    case 'completed':
      return byKind(kind, label('Terminado', 'Completed'), label('Terminada', 'Completed'));
    case 'abandoned':
      return byKind(kind, label('Abandonado', 'Abandoned'), label('Abandonada', 'Abandoned'));
  }
}

export const FORMAT_LABELS: Readonly<Record<OwnershipFormat, Label>> = {
  physical: label('Físico', 'Physical'),
  digital: label('Digital', 'Digital'),
  both: label('Ambos', 'Both'),
};

export const BOOLEAN_LABELS = { yes: label('Sí', 'Yes'), no: label('No', 'No') } as const;

/** Of a date known to have happened, but not when. */
export const UNKNOWN_DATE_LABEL = label('Indeterminada', 'Unknown');

export interface CsvContext {
  readonly language: Language;
  readonly separator: CsvSeparator;
  /** The names of the collections the item belongs to. */
  readonly collections: readonly string[];
}

export interface CsvColumn {
  /** Names the column in code; the file shows its label. */
  readonly id: string;
  readonly label: Label;
  readonly value: (item: ExportedItem, context: CsvContext) => string;
}

const yesNo = (value: boolean, { language }: CsvContext) =>
  BOOLEAN_LABELS[value ? 'yes' : 'no'][language];

const count = (value: number | null) => (value === null ? '' : String(value));

const UNKNOWN_DATE = toStoredUsageDate(UNKNOWN_USAGE_DATE);

function usageDate(value: string | null, { language }: CsvContext): string {
  if (value === null) return '';
  return value === UNKNOWN_DATE ? UNKNOWN_DATE_LABEL[language] : value;
}

const twoDigits = (value: number) => String(value).padStart(2, '0');

/** The day, in local time, as the app shows it: "2026-11-25". */
function localDay(timestamp: string): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
}

/** The columns of the CSV file of a kind, in their order. */
export function csvColumns(kind: ItemKind): CsvColumn[] {
  const columns: CsvColumn[] = [
    { id: 'title', label: label('Título', 'Title'), value: (item) => item.title ?? '' },
    {
      id: 'alternateTitles',
      label: label('Títulos alternativos', 'Alternate titles'),
      value: (item) => joinList(item.alternateTitles),
    },
    {
      id: 'status',
      label: label('Estado', 'Status'),
      value: (item, { language }) =>
        item.status === null ? '' : statusLabel(kind, item.status)[language],
    },
    {
      id: 'isReplay',
      label: byKind(kind, label('Rejugado', 'Replayed'), label('Revisionada', 'Rewatched')),
      value: (item, context) => yesNo(item.isReplay, context),
    },
    {
      id: 'isFavorite',
      label: label('Favorito', 'Favorite'),
      value: (item, context) => yesNo(item.isFavorite, context),
    },
    {
      id: 'rating',
      label: label('Valoración', 'Rating'),
      value: (item, { separator }) =>
        item.rating === null ? '' : formatDecimal(ratingToStars(item.rating), separator),
    },
    {
      id: 'format',
      label: label('Formato', 'Format'),
      value: (item, { language }) => {
        const format = toOwnershipFormat(item);
        return format === null ? '' : FORMAT_LABELS[format][language];
      },
    },
    {
      id: 'startedOn',
      label: label('Inicio', 'Start'),
      value: (item, context) => usageDate(item.startedOn, context),
    },
    {
      id: 'finishedOn',
      label: label('Fin', 'End'),
      value: (item, context) => usageDate(item.finishedOn, context),
    },
  ];
  if (kind === 'game') {
    columns.push({
      id: 'hoursPlayed',
      label: label('Horas jugadas', 'Hours played'),
      value: (item) => (item.minutesPlayed === null ? '' : formatDuration(item.minutesPlayed)),
    });
  }
  if (kind === 'series') {
    columns.push(
      {
        id: 'seasons',
        label: label('Temporadas', 'Seasons'),
        value: (item) => count(item.seasonsCount),
      },
      {
        id: 'episodes',
        label: label('Capítulos', 'Episodes'),
        value: (item) => count(item.episodesCount),
      },
    );
  }
  columns.push({
    id: 'releases',
    label: byKind(
      kind,
      label('Fechas de lanzamiento', 'Release dates'),
      label('Fechas de estreno', 'Premiere dates'),
    ),
    // A date has no ": ", so the last one always ends the region.
    value: (item) =>
      joinList(
        item.releases.map(({ region, date }) => (region === null ? date : `${region}: ${date}`)),
      ),
  });
  for (const role of rolesForKind(kind)) {
    columns.push({
      id: role,
      label: ROLE_LABELS[role],
      value: (item) => joinList(item.relations[role] ?? []),
    });
  }
  columns.push(
    {
      id: 'description',
      label: label('Descripción', 'Description'),
      value: (item) => item.description ?? '',
    },
    { id: 'notes', label: label('Notas', 'Notes'), value: (item) => item.notes ?? '' },
    {
      id: 'collections',
      label: label('Colecciones', 'Collections'),
      value: (_item, { collections }) => joinList(collections),
    },
    {
      id: 'addedOn',
      label: label('Añadido el', 'Added on'),
      value: (item) => localDay(item.createdAt),
    },
  );
  return columns;
}
