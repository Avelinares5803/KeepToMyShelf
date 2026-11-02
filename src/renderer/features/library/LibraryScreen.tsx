import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ItemKind } from '../../../shared/content';
import type { ItemSummary } from '../../../shared/items';
import { HeartIcon, ListIcon, PlusIcon, TrashIcon } from '../../components/icons';
import { errorMessage } from '../../lib/ipc';
import { useLoad } from '../../lib/use-load';
import { useItemTitle } from '../items/use-item-title';
import { Thumbnail } from '../media/Thumbnail';

interface LibraryScreenProps {
  token: string;
  kind: ItemKind;
  onOpenItem: (item: ItemSummary) => void;
  onAdd: () => void;
  onOpenTrash: () => void;
  onOpenCatalogs: () => void;
}

/** Grid of the items of one kind, bottom-aligned like books on a shelf. */
export function LibraryScreen({
  token,
  kind,
  onOpenItem,
  onAdd,
  onOpenTrash,
  onOpenCatalogs,
}: LibraryScreenProps) {
  const { t } = useTranslation();
  const displayTitle = useItemTitle();
  const items = useLoad(() => window.api.items.list({ token, kind }), [token, kind]);
  const trash = useLoad(() => window.api.items.listTrash({ token, kind }), [token, kind]);
  const trashCount = trash.data?.length ?? 0;
  const error = items.error ?? trash.error;

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

      {error !== null && (
        <p className="banner banner--error" role="alert">
          {errorMessage(t, error)}
        </p>
      )}
      {items.data?.length === 0 && <p className="muted">{t('items.empty')}</p>}
      {items.data && items.data.length > 0 && (
        <ul className="item-grid">
          {items.data.map((item) => (
            <li key={item.id}>
              <ItemCard item={item} title={displayTitle(item)} onOpen={() => onOpenItem(item)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * An item in the grid: its cover, with its own proportions, and the title below; or just
 * the title when it has no cover (or the cover's file is missing). The cover is decorative:
 * the card's name is the title.
 */
function ItemCard({
  item,
  title,
  onOpen,
}: {
  item: ItemSummary;
  title: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const [coverMissing, setCoverMissing] = useState(false);
  const cover = coverMissing ? null : item.cover;

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
      <span className="item-card__title">{title}</span>
      {item.isFavorite && (
        <span className="item-card__favorite" aria-label={t('items.fields.favorite')}>
          <HeartIcon filled />
        </span>
      )}
    </button>
  );
}
