import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ItemSummary } from '../../../shared/items';
import { Dialog } from '../../components/Dialog';
import { errorMessage } from '../../lib/ipc';
import { useDebounced } from '../../lib/use-debounced';
import { useLoad } from '../../lib/use-load';
import { useItemTitle } from '../items/use-item-title';
import { Thumbnail } from '../media/Thumbnail';

const SEARCH_DELAY_MS = 250;
/** Most items drawn at once: a long list is narrowed down by searching. */
const MAX_SHOWN_ITEMS = 100;

/** An item of the collection whose cover was chosen, with what the form needs to show it. */
export type ItemWithCover = ItemSummary & { readonly cover: NonNullable<ItemSummary['cover']> };

interface ItemCoverPickerDialogProps {
  token: string;
  collectionId: number;
  onChoose: (item: ItemWithCover) => void;
  onClose: () => void;
}

const hasCover = (item: ItemSummary): item is ItemWithCover => item.cover !== null;

/** The covers of a collection's items, to use one as the collection's own. */
export function ItemCoverPickerDialog({
  token,
  collectionId,
  onChoose,
  onClose,
}: ItemCoverPickerDialogProps) {
  const { t } = useTranslation();
  const displayTitle = useItemTitle();
  const [search, setSearch] = useState('');
  const searchText = useDebounced(search, SEARCH_DELAY_MS).trim();
  // Untitled items are found by the name they show, which depends on the UI language.
  const untitledLabel = t('items.untitled', { number: '' }).trim();
  const items = useLoad(
    () =>
      window.api.collections.listItems({
        token,
        id: collectionId,
        kind: null,
        ...(searchText.length > 0 && { search: { text: searchText, untitledLabel } }),
      }),
    [token, collectionId, searchText, untitledLabel],
  );
  const withCover = items.data?.filter(hasCover) ?? null;
  const shown = withCover?.slice(0, MAX_SHOWN_ITEMS) ?? [];

  return (
    <Dialog open title={t('collections.itemCover.title')} onClose={onClose}>
      <div className="form collection-form">
        <div className="inline-field membership__controls">
          <input
            type="search"
            className="membership__search"
            aria-label={t('library.search')}
            placeholder={t('library.search')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {items.error !== null && (
          <p className="field__error" role="alert">
            {errorMessage(t, items.error)}
          </p>
        )}
        {withCover?.length === 0 && (
          <p className="muted">
            {searchText.length > 0 ? t('library.noResults') : t('collections.itemCover.none')}
          </p>
        )}
        {shown.length > 0 && (
          <ul className="membership__list" aria-label={t('collections.itemCover.title')}>
            {shown.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="membership__option item-cover-picker__option"
                  onClick={() => onChoose(item)}
                >
                  <span className="membership__cover" aria-hidden="true">
                    <Thumbnail
                      sha256={item.cover.sha256}
                      width={item.cover.width}
                      height={item.cover.height}
                      alt=""
                      whenMissing="nothing"
                    />
                  </span>
                  <span>{displayTitle(item)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {withCover && withCover.length > shown.length && (
          <p className="muted">
            {t('library.filters.tooMany', { shown: shown.length, total: withCover.length })}
          </p>
        )}
        <div className="form__actions">
          <button type="button" className="button button--ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
