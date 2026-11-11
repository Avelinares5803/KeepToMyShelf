import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ITEM_KINDS, type ItemKind } from '../../../shared/content';
import type { ItemSummary } from '../../../shared/items';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { CheckSquareIcon, PencilIcon, PlusIcon, TrashIcon } from '../../components/icons';
import { errorMessage, unwrap } from '../../lib/ipc';
import { scrollToTop } from '../../lib/scroll-area';
import { useDebounced } from '../../lib/use-debounced';
import { useLoad } from '../../lib/use-load';
import { useItemTitle } from '../items/use-item-title';
import { LibraryGrid } from '../library/LibraryGrid';
import { LibraryToolbar } from '../library/LibraryToolbar';
import type { ImageImportOptions } from '../media/use-image-import';
import { isAllSelected, selectedAmong } from '../selection/selection';
import { SelectionBar } from '../selection/SelectionBar';
import { useSelection } from '../selection/use-selection';
import { CollectionDialog } from './CollectionDialog';
import { CollectionItemsDialog } from './CollectionItemsDialog';
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
  const [choosingItems, setChoosingItems] = useState(false);
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

  // Sorting shows the same items, so it keeps the selection; searching or the kind do not.
  const selection = useSelection(`${searchText}\n${kind}`);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const shownIds = items.data?.map((item) => item.id) ?? [];
  const selectedIds = selectedAmong(selection.selected, shownIds);

  // New results start from the top.
  const shownResults = `${searchText}\n${kind}\n${sort.field}\n${sort.direction}`;
  const lastResults = useRef(shownResults);
  useEffect(() => {
    if (lastResults.current === shownResults) return;
    lastResults.current = shownResults;
    scrollToTop();
  }, [shownResults]);

  const isEmpty = details.data?.itemCount === 0;

  return (
    // "library" shares the layout of the libraries, scrollbar space included.
    <section className={`library collection${selection.active ? ' library--selecting' : ''}`}>
      <header className="library__header">
        <h1>
          {name}
          {items.data && <span className="library__count"> ({items.data.length})</span>}
        </h1>
        <div className="item-detail__actions">
          <button
            type="button"
            className="button button--ghost"
            disabled={details.data === null}
            onClick={() => setChoosingItems(true)}
          >
            <PlusIcon /> {t('collections.items.manage')}
          </button>
          {!selection.active && shownIds.length > 0 && (
            <button type="button" className="button button--ghost" onClick={selection.start}>
              <CheckSquareIcon /> {t('selection.start')}
            </button>
          )}
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
      {isEmpty && (
        <div className="library__no-results">
          <p className="muted">{t('collections.emptyCollection')}</p>
          <button
            type="button"
            className="button button--primary"
            onClick={() => setChoosingItems(true)}
          >
            {t('collections.items.addFirst')}
          </button>
        </div>
      )}
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
          selection={
            selection.active
              ? { selected: selection.selected, onToggle: selection.toggle }
              : undefined
          }
        />
      )}

      {selection.active && (
        <SelectionBar
          countLabel={t('selection.items', { count: selectedIds.length })}
          count={selectedIds.length}
          allSelected={isAllSelected(selection.selected, shownIds)}
          actionLabel={t('selection.removeFromCollection')}
          onToggleAll={() => selection.toggleAll(shownIds)}
          onAction={() => setConfirmingRemove(true)}
          onCancel={selection.stop}
        />
      )}
      {confirmingRemove && (
        <ConfirmDialog
          title={t('selection.removeFromCollection')}
          confirmLabel={t('selection.removeFromCollection')}
          danger
          onClose={() => setConfirmingRemove(false)}
          onConfirm={async () => {
            unwrap(
              await window.api.collections.changeMemberships({
                token,
                add: [],
                remove: selectedIds.map((itemId) => ({ collectionId, itemId })),
              }),
            );
            setConfirmingRemove(false);
            selection.stop();
            details.reload();
            items.reload();
          }}
        >
          <p>{t('selection.removeConfirm', { count: selectedIds.length, name })}</p>
        </ConfirmDialog>
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
      {choosingItems && (
        <CollectionItemsDialog
          token={token}
          collectionId={collectionId}
          collectionName={name}
          // The kind being looked at; with every kind shown, the first one.
          initialKind={kind ?? ITEM_KINDS[0]}
          onClose={() => setChoosingItems(false)}
          onSaved={() => {
            setChoosingItems(false);
            details.reload();
            items.reload();
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
