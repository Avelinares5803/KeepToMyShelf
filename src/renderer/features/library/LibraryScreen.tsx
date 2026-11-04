import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ItemKind } from '../../../shared/content';
import type { ItemSummary } from '../../../shared/items';
import { HeartIcon, ListIcon, PlusIcon, TrashIcon } from '../../components/icons';
import { errorMessage } from '../../lib/ipc';
import { useDebounced } from '../../lib/use-debounced';
import { useLoad } from '../../lib/use-load';
import { useItemTitle } from '../items/use-item-title';
import { Thumbnail } from '../media/Thumbnail';
import type { LibraryView } from './library-view';
import { LibraryToolbar } from './LibraryToolbar';

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

/** Grid of the items of one kind, bottom-aligned like books on a shelf. */
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
  const items = useLoad(
    () =>
      window.api.items.list({
        token,
        kind,
        sort,
        ...(isSearching && { search: { text: searchText, untitledLabel } }),
      }),
    [token, kind, sort.field, sort.direction, searchText, untitledLabel],
  );
  const trash = useLoad(() => window.api.items.listTrash({ token, kind }), [token, kind]);
  const trashCount = trash.data?.length ?? 0;
  const error = items.error ?? trash.error;
  const hasItems = items.data !== null;

  // The window is what scrolls. Its position is saved when leaving the screen, and restored
  // once there is something to scroll: the first results.
  const scrollY = useRef(view.scrollY);
  const saveView = useRef(onViewChange);
  useLayoutEffect(() => {
    saveView.current = onViewChange;
  });
  useEffect(() => {
    const onScroll = () => {
      scrollY.current = window.scrollY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      saveView.current({ scrollY: scrollY.current });
    };
  }, []);

  const restored = useRef(false);
  useLayoutEffect(() => {
    if (!hasItems || restored.current) return;
    restored.current = true;
    window.scrollTo(0, view.scrollY);
  }, [hasItems, view.scrollY]);

  // New results start from the top.
  const shownResults = `${searchText}\n${sort.field}\n${sort.direction}`;
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
        onSearch={(search) => onViewChange({ search })}
        onSort={(next) => onViewChange({ sort: next })}
      />

      {error !== null && (
        <p className="banner banner--error" role="alert">
          {errorMessage(t, error)}
        </p>
      )}
      {items.data?.length === 0 &&
        (isSearching ? (
          <div className="library__no-results">
            <p className="muted">{t('library.noResults')}</p>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => onViewChange({ search: '' })}
            >
              {t('library.clearSearch')}
            </button>
          </div>
        ) : (
          <p className="muted">{t('items.empty')}</p>
        ))}
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
