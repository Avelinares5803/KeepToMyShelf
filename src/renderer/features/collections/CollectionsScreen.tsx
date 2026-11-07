import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CollectionDetails, CollectionSummary } from '../../../shared/collections';
import { PlusIcon } from '../../components/icons';
import { errorMessage } from '../../lib/ipc';
import { useLoad } from '../../lib/use-load';
import { Thumbnail } from '../media/Thumbnail';
import type { ImageImportOptions } from '../media/use-image-import';
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

  return (
    <section className="collections">
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
              <CollectionCard collection={collection} onOpen={() => onOpen(collection)} />
            </li>
          ))}
        </ul>
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
  onOpen,
}: {
  collection: CollectionSummary;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const [coverMissing, setCoverMissing] = useState(false);
  const cover = coverMissing ? null : collection.cover;

  return (
    <button
      type="button"
      className={`item-card${cover ? ' item-card--cover' : ''}`}
      onClick={onOpen}
    >
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
