import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ItemSort, ItemSortField } from '../../../core/filters/item-sort';
import type { ItemKind } from '../../../shared/content';
import { LIBRARY_COLUMNS_MAX, LIBRARY_COLUMNS_MIN } from '../../../shared/settings';
import { LargeCoversIcon, SmallCoversIcon } from '../../components/icons';
import { reversedSort, sortByField } from './library-view';

interface LibraryToolbarProps<F extends ItemSortField> {
  /** The kind listed; null when every kind is (e.g. in a collection). */
  kind: ItemKind | null;
  search: string;
  /** What this screen can be sorted by, in the order to offer it. */
  sortFields: readonly F[];
  sort: ItemSort<F>;
  /** The button of the filters; left out where there are none (e.g. in a collection). */
  filters?: {
    /** How many filters are marked, shown in the button that opens them. */
    readonly marks: number;
    readonly open: boolean;
    readonly onToggle: () => void;
  };
  /** More controls, between the search box and the sort controls. */
  children?: ReactNode;
  /** The columns of covers chosen: fewer columns, bigger covers. */
  columns: number;
  onSearch: (search: string) => void;
  onSort: (sort: ItemSort<F>) => void;
  onColumnsChange: (columns: number) => void;
}

/** What each direction means depends on what is being sorted. */
const directionGroup = (field: ItemSortField) => {
  if (field === 'title') return 'text';
  return field === 'rating' ? 'number' : 'date';
};

/** "Release date" for games, "premiere date" for movies and series, both for every kind. */
function releaseDateKey(kind: ItemKind | null): string {
  if (kind === null) return 'library.sort.releaseOrPremiereDate';
  return kind === 'game' ? 'library.sort.releaseDate' : 'library.sort.premiereDate';
}

/** The search box, the button of the filters and the sort controls of a library. */
export function LibraryToolbar<F extends ItemSortField>({
  kind,
  search,
  sortFields,
  sort,
  filters,
  children,
  columns,
  onSearch,
  onSort,
  onColumnsChange,
}: LibraryToolbarProps<F>) {
  const { t } = useTranslation();
  const id = useId();

  const fieldLabel = (field: ItemSortField) =>
    field === 'releaseDate' ? t(releaseDateKey(kind)) : t(`library.sort.${field}`);

  return (
    <div className="library__toolbar inline-field">
      <input
        type="search"
        className="library__search"
        aria-label={t('library.search')}
        placeholder={t('library.search')}
        value={search}
        onChange={(event) => onSearch(event.target.value)}
      />
      {filters && (
        <button
          type="button"
          className="button button--ghost"
          aria-expanded={filters.open}
          onClick={filters.onToggle}
        >
          {filters.marks > 0
            ? t('library.filters.openWithCount', { count: filters.marks })
            : t('library.filters.open')}
        </button>
      )}
      {children}
      <div className="inline-field">
        <label htmlFor={`${id}-sort`}>{t('library.sort.label')}</label>
        <select
          id={`${id}-sort`}
          value={sort.field}
          onChange={(event) => onSort(sortByField(event.target.value as F))}
        >
          {sortFields.map((field) => (
            <option key={field} value={field}>
              {fieldLabel(field)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="button button--ghost"
          title={t('library.sort.reverse')}
          onClick={() => onSort(reversedSort(sort))}
        >
          {t(`library.sort.direction.${directionGroup(sort.field)}.${sort.direction}`)}
        </button>
      </div>
      <CoverSizeSlider columns={columns} onChange={onColumnsChange} />
    </div>
  );
}

/**
 * The size of the covers. The slider grows the covers to the right, which means fewer columns:
 * its value is how many columns fewer than the most there are.
 */
function CoverSizeSlider({
  columns,
  onChange,
}: {
  columns: number;
  onChange: (columns: number) => void;
}) {
  const { t } = useTranslation();
  const label = t('library.coverSize.label');
  return (
    <div className="library__cover-size" title={label}>
      <SmallCoversIcon />
      <input
        type="range"
        aria-label={label}
        aria-valuetext={t('library.coverSize.columns', { count: columns })}
        min={0}
        max={LIBRARY_COLUMNS_MAX - LIBRARY_COLUMNS_MIN}
        step={1}
        value={LIBRARY_COLUMNS_MAX - columns}
        onChange={(event) => onChange(LIBRARY_COLUMNS_MAX - Number(event.target.value))}
      />
      <LargeCoversIcon />
    </div>
  );
}
