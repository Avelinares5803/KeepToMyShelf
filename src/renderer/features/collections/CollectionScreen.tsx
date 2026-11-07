import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ITEM_KINDS, type ItemKind } from '../../../shared/content';
import type { ItemSummary } from '../../../shared/items';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PencilIcon, TrashIcon } from '../../components/icons';
import { errorMessage, unwrap } from '../../lib/ipc';
import { useDebounced } from '../../lib/use-debounced';
import { useLoad } from '../../lib/use-load';
import { useItemTitle } from '../items/use-item-title';
import { LibraryGrid } from '../library/LibraryGrid';
import { LibraryToolbar } from '../library/LibraryToolbar';
import type { ImageImportOptions } from '../media/use-image-import';
import { CollectionDialog } from './CollectionDialog';
import type { CollectionView } from './collection-view';

const SEARCH_DELAY_MS = 250;

interface CollectionScreenProps {
  token: string;
  collectionId: number;
  /** Kept outside: this screen is gone while an item is open, and the view must survive that. */
  view: CollectionView;
  onViewChange: (change: Partial<CollectionView>) => void;
  imageImport: ImageImportOptions;
  onOpenItem: (item: ItemSummary) => void;
  onDeleted: () => void;
  /** Reports the collection's name so the breadcrumbs can show it. */
  onTitle: (name: string) => void;
}

/** The items of a collection, of every kind or one, with the library's search and sort. */
export function CollectionScreen({
  token,
  collectionId,
  view,
  onViewChange,
  imageImport,
  onOpenItem,
  onDeleted,
  onTitle,
}: CollectionScreenProps) {
  const { t } = useTranslation();
  const kindId = useId();
  const displayTitle = useItemTitle();
  const { sort, kind } = view;
  const searchText = useDebounced(view.search, SEARCH_DELAY_MS).trim();
  const isSearching = searchText.length > 0;
  // Untitled items are found by the name they show, which depends on the UI language.
  const untitledLabel = t('items.untitled', { number: '' }).trim();

  const details = useLoad(
    () => window.api.collections.get({ token, id: collectionId }),
    [token, collectionId],
  );
  const items = useLoad(
    () =>
      window.api.collections.listItems({
        token,
        id: collectionId,
        kind,
        sort,
        ...(isSearching && { search: { text: searchText, untitledLabel } }),
      }),
    [token, collectionId, kind, sort.field, sort.direction, searchText, untitledLabel],
  );
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const name = details.data?.name ?? '';
  const error = details.error ?? items.error;

  useEffect(() => {
    if (name !== '') onTitle(name);
  }, [onTitle, name]);

  // Where to return to when coming back, until the user asks for different results.
  const [restoreTo, setRestoreTo] = useState(view.anchor);
  const changeResults = (change: Partial<CollectionView>) => {
    setRestoreTo(null);
    onViewChange(change);
  };

  // New results start from the top.
  const shownResults = `${searchText}\n${kind}\n${sort.field}\n${sort.direction}`;
  const lastResults = useRef(shownResults);
  useEffect(() => {
    if (lastResults.current === shownResults) return;
    lastResults.current = shownResults;
    window.scrollTo(0, 0);
  }, [shownResults]);

  const isEmpty = details.data?.itemCount === 0;

  return (
    // "library" shares the layout of the libraries, scrollbar space included.
    <section className="library collection">
      <header className="library__header">
        <h1>
          {name}
          {items.data && <span className="library__count"> ({items.data.length})</span>}
        </h1>
        <div className="item-detail__actions">
          <button
            type="button"
            className="icon-button"
            aria-label={t('collections.edit')}
            title={t('collections.edit')}
            disabled={details.data === null}
            onClick={() => setEditing(true)}
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={t('collections.delete')}
            title={t('collections.delete')}
            disabled={details.data === null}
            onClick={() => setDeleting(true)}
          >
            <TrashIcon />
          </button>
        </div>
      </header>

      {!isEmpty && (
        <LibraryToolbar
          kind={kind}
          search={view.search}
          sort={sort}
          onSearch={(search) => changeResults({ search })}
          onSort={(next) => changeResults({ sort: next })}
        >
          <div className="inline-field">
            <label htmlFor={kindId}>{t('collections.show')}</label>
            <select
              id={kindId}
              value={kind ?? 'all'}
              onChange={(event) =>
                changeResults({
                  kind: event.target.value === 'all' ? null : (event.target.value as ItemKind),
                })
              }
            >
              <option value="all">{t('collections.all')}</option>
              {ITEM_KINDS.map((option) => (
                <option key={option} value={option}>
                  {t(`modes.${option}`)}
                </option>
              ))}
            </select>
          </div>
        </LibraryToolbar>
      )}

      {error !== null && (
        <p className="banner banner--error" role="alert">
          {errorMessage(t, error)}
        </p>
      )}
      {isEmpty && <p className="muted">{t('collections.emptyCollection')}</p>}
      {!isEmpty && items.data?.length === 0 && (
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
            {kind !== null && (
              <button
                type="button"
                className="button button--ghost"
                onClick={() => changeResults({ kind: null })}
              >
                {t('collections.showAll')}
              </button>
            )}
          </div>
        </div>
      )}
      {items.data && items.data.length > 0 && (
        <LibraryGrid
          items={items.data}
          label={name}
          titleOf={displayTitle}
          restoreTo={restoreTo}
          showKind={kind === null}
          onLeave={(anchor) => onViewChange({ anchor })}
          onOpenItem={onOpenItem}
        />
      )}

      {editing && details.data && (
        <CollectionDialog
          token={token}
          collection={details.data}
          imageImport={imageImport}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            details.reload();
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={t('collections.delete')}
          confirmLabel={t('collections.delete')}
          danger
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            unwrap(await window.api.collections.delete({ token, id: collectionId }));
            onDeleted();
          }}
        >
          <p>{t('collections.deleteConfirm', { name })}</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
