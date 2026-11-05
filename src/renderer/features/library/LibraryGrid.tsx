import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ItemSummary } from '../../../shared/items';
import { HeartIcon } from '../../components/icons';
import { Thumbnail } from '../media/Thumbnail';
import {
  cardWidthFor,
  columnCountFor,
  estimateRowHeight,
  itemsInRow,
  rowCountFor,
  rowOfItem,
} from './grid-layout';
import type { LibraryAnchor } from './library-view';

// In rem. They match .item-grid__row and .item-card in the styles.
const CARD_MIN_WIDTH = 10;
const COLUMN_GAP = 1;
const ROW_GAP = 1.5;
const PLAIN_CARD_HEIGHT = 7;
const TITLE_HEIGHT = 1.6;
/** Rows drawn beyond the visible ones, so scrolling and Tab always find something there. */
const OVERSCAN_ROWS = 3;

interface LibraryGridProps {
  items: readonly ItemSummary[];
  label: string;
  titleOf: (item: ItemSummary) => string;
  /** The item to return to when the grid appears; null starts from the top. */
  restoreTo: LibraryAnchor | null;
  /** Told when the grid goes away, with the item to return to. */
  onLeave: (anchor: LibraryAnchor | null) => void;
  onOpenItem: (item: ItemSummary) => void;
}

interface GridBox {
  readonly width: number;
  /** Distance from the top of the page, which is what scrolls. */
  readonly top: number;
  readonly rem: number;
}

function anchorIndex(items: readonly ItemSummary[], anchor: LibraryAnchor): number {
  const index = items.findIndex((item) => item.id === anchor.itemId);
  // The item may be gone (e.g. moved to the trash): its place is the closest thing left.
  return index === -1 ? Math.min(anchor.index, items.length - 1) : index;
}

/**
 * The items of a library, bottom-aligned like books on a shelf. Only the rows near the visible
 * part of the page exist, so its speed does not depend on the size of the library.
 */
export function LibraryGrid({
  items,
  label,
  titleOf,
  restoreTo,
  onLeave,
  onOpenItem,
}: LibraryGridProps) {
  const container = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<GridBox | null>(null);

  // The observer also answers before the first paint, so the grid never shows without rows.
  useLayoutEffect(() => {
    const element = container.current;
    if (element === null) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      const next: GridBox = {
        width: rect.width,
        top: rect.top + window.scrollY,
        rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
      };
      setBox((current) =>
        current?.width === next.width && current.top === next.top && current.rem === next.rem
          ? current
          : next,
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    // What is above the grid can change height too, moving the grid down the page.
    if (element.parentElement !== null) observer.observe(element.parentElement);
    return () => observer.disconnect();
  }, []);

  const rem = box?.rem ?? 16;
  const columns =
    box === null ? 0 : columnCountFor(box.width, CARD_MIN_WIDTH * rem, COLUMN_GAP * rem);
  const cardWidth = box === null ? 0 : cardWidthFor(box.width, columns, COLUMN_GAP * rem);

  const estimateSize = useCallback(
    (row: number) =>
      estimateRowHeight(itemsInRow(items, row, columns), {
        cardWidth,
        plainCardHeight: PLAIN_CARD_HEIGHT * rem,
        titleHeight: TITLE_HEIGHT * rem,
        rowGap: ROW_GAP * rem,
      }),
    [items, columns, cardWidth, rem],
  );
  // A row is identified by what it starts with, so its known height follows it when sorting.
  const getItemKey = useCallback(
    (row: number) => `${items[row * columns]?.id}:${columns}`,
    [items, columns],
  );
  const virtualizer = useWindowVirtualizer({
    count: columns === 0 ? 0 : rowCountFor(items.length, columns),
    estimateSize,
    getItemKey,
    overscan: OVERSCAN_ROWS,
    scrollMargin: box?.top ?? 0,
  });

  // After every render: return to the item when the grid appears or its columns change, or
  // else note which item is the first visible one.
  const anchor = useRef<LibraryAnchor | null>(null);
  const laidOutColumns = useRef(0);
  useLayoutEffect(() => {
    if (columns === 0) return;
    if (columns !== laidOutColumns.current) {
      const appearing = laidOutColumns.current === 0;
      laidOutColumns.current = columns;
      if (appearing) anchor.current = restoreTo;
      if (anchor.current !== null) {
        const row = rowOfItem(anchorIndex(items, anchor.current), columns);
        virtualizer.scrollToIndex(row, { align: 'start' });
      } else if (appearing) {
        window.scrollTo(0, 0);
      }
      return;
    }
    const offset = virtualizer.scrollOffset ?? 0;
    const row = offset > (box?.top ?? 0) ? virtualizer.getVirtualItemForOffset(offset) : undefined;
    const index = row === undefined ? -1 : row.index * columns;
    const item = items[index];
    anchor.current = item === undefined ? null : { itemId: item.id, index };
  });

  const leave = useRef(onLeave);
  useLayoutEffect(() => {
    leave.current = onLeave;
  });
  useEffect(() => () => leave.current(anchor.current), []);

  return (
    <div
      ref={container}
      className="item-grid"
      role="list"
      aria-label={label}
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((row) => (
        <div
          key={row.key}
          ref={virtualizer.measureElement}
          data-index={row.index}
          role="none"
          className="item-grid__row"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`,
          }}
        >
          {itemsInRow(items, row.index, columns).map((item, position) => (
            <div
              key={item.id}
              role="listitem"
              aria-setsize={items.length}
              aria-posinset={row.index * columns + position + 1}
            >
              <ItemCard item={item} title={titleOf(item)} onOpen={() => onOpenItem(item)} />
            </div>
          ))}
        </div>
      ))}
    </div>
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
