import { useTranslation } from 'react-i18next';
import type { ItemKind } from '../../../shared/content';
import type { ItemSummary } from '../../../shared/items';
import { HeartIcon, PlusIcon, TrashIcon } from '../../components/icons';
import { errorMessage } from '../../lib/ipc';
import { useLoad } from '../../lib/use-load';
import { useItemTitle } from '../items/use-item-title';

interface LibraryScreenProps {
  token: string;
  kind: ItemKind;
  onOpenItem: (item: ItemSummary) => void;
  onAdd: () => void;
  onOpenTrash: () => void;
}

/** Grid of the items of one kind. Covers replace the title tiles in phase F6. */
export function LibraryScreen({ token, kind, onOpenItem, onAdd, onOpenTrash }: LibraryScreenProps) {
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
              <button type="button" className="item-card" onClick={() => onOpenItem(item)}>
                <span className="item-card__title">{displayTitle(item)}</span>
                {item.isFavorite && (
                  <span className="item-card__favorite" aria-label={t('items.fields.favorite')}>
                    <HeartIcon filled />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
