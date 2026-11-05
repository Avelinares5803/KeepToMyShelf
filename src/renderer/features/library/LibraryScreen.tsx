import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ItemKind } from '../../../shared/content';
import type { ItemSummary } from '../../../shared/items';
import { ListIcon, PlusIcon, TrashIcon } from '../../components/icons';
import { errorMessage } from '../../lib/ipc';
import { useDebounced } from '../../lib/use-debounced';
import { useLoad } from '../../lib/use-load';
import { useItemTitle } from '../items/use-item-title';
import type { LibraryView } from './library-view';
import { LibraryGrid } from './LibraryGrid';
import { LibraryToolbar } from './LibraryToolbar';
import {
  countMarks,
  NO_SIMPLE_FILTERS,
  toFilterTree,
  withoutMissingValues,
} from './simple-filters';
import { SimpleFilters } from './SimpleFilters';

const SEARCH_DELAY_MS = 250;

interface LibraryScreenProps {
  token: string;
  kind: ItemKind;
  /** Kept outside: this screen is gone while an item is open, and the view must survive that. */
  view: LibraryView;
  onViewChange: (change: Partial<LibraryView>) => void;
  onOpenItem: (item: ItemSummary) => void;
  onAdd: () => void;
  onOpenTrash: () => void;
  onOpenCatalogs: () => void;
}

/** The items of one kind, with their search box and sort controls. */
export function LibraryScreen({
  token,
  kind,
  view,
  onViewChange,
  onOpenItem,
  onAdd,
  onOpenTrash,
  onOpenCatalogs,
}: LibraryScreenProps) {
  const { t } = useTranslation();
  const displayTitle = useItemTitle();
  const { sort } = view;
  const searchText = useDebounced(view.search, SEARCH_DELAY_MS).trim();
  const isSearching = searchText.length > 0;
  // Untitled items are found by the name they show, which depends on the UI language.
  const untitledLabel = t('items.untitled', { number: '' }).trim();
  const filter = toFilterTree(view.filters);
  const filterKey = JSON.stringify(filter);
  const hasFilters = filter !== undefined;
  const items = useLoad(
    () =>
      window.api.items.list({
        token,
        kind,
        sort,
        ...(isSearching && { search: { text: searchText, untitledLabel } }),
        ...(filter && { filter }),
      }),
    [token, kind, sort.field, sort.direction, searchText, untitledLabel, filterKey],
  );
  const trash = useLoad(() => window.api.items.listTrash({ token, kind }), [token, kind]);
  const filterValues = useLoad(() => window.api.items.filterValues({ token, kind }), [token, kind]);
  const trashCount = trash.data?.length ?? 0;
  const error = items.error ?? trash.error ?? filterValues.error;

  // A marked value may be gone when coming back (e.g. deleted from its catalog).
  useEffect(() => {
    if (filterValues.data === null) return;
    const kept = withoutMissingValues(view.filters, filterValues.data);
    if (kept !== view.filters) onViewChange({ filters: kept });
    // Only when the values arrive: marks made after that are always of existing values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterValues.data]);

  // Where to return to when coming back, until the user asks for different results.
  const [restoreTo, setRestoreTo] = useState(view.anchor);
  const changeResults = (change: Partial<LibraryView>) => {
    setRestoreTo(null);
    onViewChange(change);
  };

  // New results start from the top.
  const shownResults = `${searchText}\n${sort.field}\n${sort.direction}\n${filterKey}`;
  const lastResults = useRef(shownResults);
  useEffect(() => {
    if (lastResults.current === shownResults) return;
    lastResults.current = shownResults;
    window.scrollTo(0, 0);
  }, [shownResults]);

  return (
    <section className="library">
      <header className="library__header">
        <h1>
          {t(`modes.${kind}`)}
          {items.data && <span className="library__count"> ({items.data.length})</span>}
        </h1>
        <div className="library__actions">
          <button type="button" className="button button--primary" onClick={onAdd}>
            <PlusIcon /> {t('items.add')}
          </button>
          <button type="button" className="button button--ghost" onClick={onOpenTrash}>
            <TrashIcon /> {t('trash.openWithCount', { count: trashCount })}
          </button>
          <button type="button" className="button button--ghost" onClick={onOpenCatalogs}>
            <ListIcon /> {t('catalogs.title')}
          </button>
        </div>
      </header>

      <LibraryToolbar
        kind={kind}
        search={view.search}
        sort={sort}
        filterMarks={countMarks(view.filters)}
        filtersOpen={view.filtersOpen}
        onSearch={(search) => changeResults({ search })}
        onSort={(next) => changeResults({ sort: next })}
        onToggleFilters={() => onViewChange({ filtersOpen: !view.filtersOpen })}
      />
      {view.filtersOpen && (
        <SimpleFilters
          kind={kind}
          filters={view.filters}
          values={filterValues.data}
          onChange={(filters) => changeResults({ filters })}
        />
      )}

      {error !== null && (
        <p className="banner banner--error" role="alert">
          {errorMessage(t, error)}
        </p>
      )}
      {items.data?.length === 0 &&
        (isSearching || hasFilters ? (
          <div className="library__no-results">
            <p className="muted">{t('library.noResults')}</p>
            <div className="library__actions">
              {isSearching && (
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => changeResults({ search: '' })}
                >
                  {t('library.clearSearch')}
                </button>
              )}
              {hasFilters && (
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => changeResults({ filters: NO_SIMPLE_FILTERS })}
                >
                  {t('library.filters.clear')}
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className="muted">{t('items.empty')}</p>
        ))}
      {items.data && items.data.length > 0 && (
        <LibraryGrid
          items={items.data}
          label={t(`modes.${kind}`)}
          titleOf={displayTitle}
          restoreTo={restoreTo}
          onLeave={(anchor) => onViewChange({ anchor })}
          onOpenItem={onOpenItem}
        />
      )}
    </section>
  );
}
