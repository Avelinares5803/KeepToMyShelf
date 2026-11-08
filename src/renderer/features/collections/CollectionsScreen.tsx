import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CollectionDetails, CollectionSummary } from '../../../shared/collections';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { CheckSquareIcon, PlusIcon } from '../../components/icons';
import { errorMessage, unwrap } from '../../lib/ipc';
import { useLoad } from '../../lib/use-load';
import { Thumbnail } from '../media/Thumbnail';
import type { ImageImportOptions } from '../media/use-image-import';
import {
  cardClassName,
  isAllSelected,
  selectableProps,
  selectedAmong,
} from '../selection/selection';
import { SelectionBar } from '../selection/SelectionBar';
import { SelectionMark } from '../selection/SelectionMark';
import { useSelection } from '../selection/use-selection';
import { CollectionDialog } from './CollectionDialog';

interface CollectionsScreenProps {
  token: string;
  imageImport: ImageImportOptions;
  onOpen: (collection: { id: number; name: string }) => void;
}

/** Every collection of the profile, by name, and the button to create a new one. */
export function CollectionsScreen({ token, imageImport, onOpen }: CollectionsScreenProps) {
  const { t } = useTranslation();
  const collections = useLoad(() => window.api.collections.list({ token }), [token]);
  const [creating, setCreating] = useState(false);
  // The list has no search: the selection only goes when the screen or the mode is left.
  const selection = useSelection('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const shownIds = collections.data?.map((collection) => collection.id) ?? [];
  const selectedIds = selectedAmong(selection.selected, shownIds);

  return (
    <section className={`collections${selection.active ? ' library--selecting' : ''}`}>
      <header className="library__header">
        <h1>
          {t('collections.title')}
          {collections.data && <span className="library__count"> ({collections.data.length})</span>}
        </h1>
        <div className="library__actions">
          <button
            type="button"
            className="button button--primary"
            onClick={() => setCreating(true)}
          >
            <PlusIcon /> {t('collections.new')}
          </button>
          {!selection.active && shownIds.length > 0 && (
            <button type="button" className="button button--ghost" onClick={selection.start}>
              <CheckSquareIcon /> {t('selection.start')}
            </button>
          )}
        </div>
      </header>

      {collections.error !== null && (
        <p className="banner banner--error" role="alert">
          {errorMessage(t, collections.error)}
        </p>
      )}
      {collections.data?.length === 0 && <p className="muted">{t('collections.empty')}</p>}
      {collections.data && collections.data.length > 0 && (
        <ul className="collection-grid" aria-label={t('collections.title')}>
          {collections.data.map((collection) => (
            <li key={collection.id}>
              <CollectionCard
                collection={collection}
                selected={selection.active ? selection.selected.has(collection.id) : null}
                onOpen={() =>
                  selection.active ? selection.toggle(collection.id) : onOpen(collection)
                }
              />
            </li>
          ))}
        </ul>
      )}

      {selection.active && (
        <SelectionBar
          countLabel={t('selection.collections', { count: selectedIds.length })}
          count={selectedIds.length}
          allSelected={isAllSelected(selection.selected, shownIds)}
          actionLabel={t('selection.deleteCollections')}
          onToggleAll={() => selection.toggleAll(shownIds)}
          onAction={() => setConfirmingDelete(true)}
          onCancel={selection.stop}
        />
      )}
      {confirmingDelete && (
        <ConfirmDialog
          title={t('selection.deleteCollections')}
          confirmLabel={t('selection.deleteCollections')}
          danger
          onClose={() => setConfirmingDelete(false)}
          onConfirm={async () => {
            unwrap(await window.api.collections.deleteMany({ token, ids: selectedIds }));
            setConfirmingDelete(false);
            selection.stop();
            collections.reload();
          }}
        >
          <p>{t('selection.deleteCollectionsConfirm', { count: selectedIds.length })}</p>
        </ConfirmDialog>
      )}

      {creating && (
        <CollectionDialog
          token={token}
          collection={null}
          imageImport={imageImport}
          onClose={() => setCreating(false)}
          // A new collection opens at once, like a new item opens its detail view.
          onSaved={(created: CollectionDetails) => {
            setCreating(false);
            onOpen(created);
          }}
        />
      )}
    </section>
  );
}

/** A collection: its cover with the name below, or just the name, and how many items. */
function CollectionCard({
  collection,
  selected,
  onOpen,
}: {
  collection: CollectionSummary;
  /** Whether it is marked, in "Select" mode; null outside it. */
  selected: boolean | null;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const [coverMissing, setCoverMissing] = useState(false);
  const cover = coverMissing ? null : collection.cover;

  return (
    <button
      type="button"
      className={cardClassName(cover !== null, selected)}
      {...selectableProps(selected)}
      onClick={onOpen}
    >
      {selected !== null && <SelectionMark />}
      {cover && (
        <span className="item-card__image">
          <Thumbnail
            sha256={cover.sha256}
            width={cover.width}
            height={cover.height}
            alt=""
            whenMissing="nothing"
            onMissing={() => setCoverMissing(true)}
          />
        </span>
      )}
      <span className="item-card__title">{collection.name}</span>
      <span className="item-card__meta">
        {t('collections.itemCount', { count: collection.itemCount })}
      </span>
    </button>
  );
}
