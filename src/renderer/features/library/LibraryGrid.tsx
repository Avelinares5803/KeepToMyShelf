import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { ItemSummary } from '../../../shared/items';
import { HeartIcon } from '../../components/icons';
import { scrollArea, scrollToTop } from '../../lib/scroll-area';
import { Thumbnail } from '../media/Thumbnail';
import { cardClassName, selectableProps } from '../selection/selection';
import { SelectionMark } from '../selection/SelectionMark';
import {
  cardWidthFor,
  chosenColumnCount,
  estimateRowHeight,
  itemsInRow,
  rowCountFor,
  rowOfItem,
} from './grid-layout';
import type { LibraryAnchor } from './library-view';

// In rem. They match .item-grid__row and .item-card in the styles.
/**
 * Narrowest card, so that the titles of cards without a cover do not break in the middle of a
 * word. In narrow windows, fewer columns than chosen may fit (8 of 10 in the narrowest one).
 */
const CARD_MIN_WIDTH = 6;
const COLUMN_GAP = 1;
const ROW_GAP = 1.5;
const PLAIN_CARD_HEIGHT = 7;
const TITLE_HEIGHT = 1.6;
/** Rows drawn beyond the visible ones, so scrolling and Tab always find something there. */
const OVERSCAN_ROWS = 3;

interface LibraryGridProps {
  items: readonly ItemSummary[];
  label: string;
  /** The columns chosen by the user: fewer columns, bigger covers. */
  columns: number;
  titleOf: (item: ItemSummary) => string;
  /** The item to return to when the grid appears; null starts from the top. */
  restoreTo: LibraryAnchor | null;
  /** Told when the grid goes away, with the item to return to. */
  onLeave: (anchor: LibraryAnchor | null) => void;
  onOpenItem: (item: ItemSummary) => void;
  /**
   * The toolbar that stays at the top of the scrolling area (see LibraryToolbar). The rows under
   * it are hidden, so the item returned to is placed below it, and the one noted is the first
   * one below it.
   */
  stickyBar: RefObject<HTMLElement | null>;
  /** Shows each item's kind under its title, when items of several kinds are listed. */
  showKind?: boolean;
  /** In "Select" mode: clicking a card marks it instead of opening it. */
  selection?: CardSelection | undefined;
}

export interface CardSelection {
  readonly selected: ReadonlySet<number>;
  readonly onToggle: (id: number) => void;
}

interface GridBox {
  readonly width: number;
  /** Distance from the top of the scrolling area's content. */
  readonly top: number;
  /** The height of the toolbar that stays at the top, which hides what is under it. */
  readonly covered: number;
  readonly rem: number;
}

function anchorIndex(items: readonly ItemSummary[], anchor: LibraryAnchor): number {
  const index = items.findIndex((item) => item.id === anchor.itemId);
  // The item may be gone (e.g. moved to the trash): its place is the closest thing left.
  return index === -1 ? Math.min(anchor.index, items.length - 1) : index;
}

/**
 * The items of a library, bottom-aligned like books on a shelf. Only the rows near the visible
 * part of the scrolling area exist, so its speed does not depend on the size of the library.
 */
export function LibraryGrid({
  items,
  label,
  columns: chosenColumns,
  titleOf,
  restoreTo,
  onLeave,
  onOpenItem,
  stickyBar,
  showKind = false,
  selection,
}: LibraryGridProps) {
  const container = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<GridBox | null>(null);

  // The observer also answers before the first paint, so the grid never shows without rows.
  useLayoutEffect(() => {
    const element = container.current;
    const area = scrollArea();
    if (element === null || area === null) return;
    const bar = stickyBar.current;
    const update = () => {
      const rect = element.getBoundingClientRect();
      const next: GridBox = {
        width: rect.width,
        top: rect.top - area.getBoundingClientRect().top + area.scrollTop,
        covered: bar?.offsetHeight ?? 0,
        rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
      };
      setBox((current) =>
        current?.width === next.width &&
        current.top === next.top &&
        current.covered === next.covered &&
        current.rem === next.rem
          ? current
          : next,
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    // What is above the grid can change height too, moving the grid down the page.
    if (element.parentElement !== null) observer.observe(element.parentElement);
    // The toolbar takes two lines in a narrow window.
    if (bar !== null) observer.observe(bar);
    return () => observer.disconnect();
  }, [stickyBar]);

  const covered = box?.covered ?? 0;
  const rem = box?.rem ?? 16;
  const columns =
    box === null
      ? 0
      : chosenColumnCount(box.width, chosenColumns, CARD_MIN_WIDTH * rem, COLUMN_GAP * rem);
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
  // The rule warns that the React Compiler cannot memoize what this returns. The project does
  // not use the React Compiler, so nothing is memoized wrongly.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    getScrollElement: scrollArea,
    count: columns === 0 ? 0 : rowCountFor(items.length, columns),
    estimateSize,
    getItemKey,
    overscan: OVERSCAN_ROWS,
    scrollMargin: box?.top ?? 0,
    // The row returned to is placed below the toolbar, not under it.
    scrollPaddingStart: covered,
  });

  // After every render: return to the item when the grid appears or its columns change, or
  // else note which item is the first visible one.
  const anchor = useRef<LibraryAnchor | null>(null);
  const laidOutColumns = useRef(0);
  const noteAnchor = () => {
    // The first row seen is the one just below the toolbar.
    const offset = (virtualizer.scrollOffset ?? 0) + covered;
    const row = offset > (box?.top ?? 0) ? virtualizer.getVirtualItemForOffset(offset) : undefined;
    const index = row === undefined ? -1 : row.index * columns;
    const item = items[index];
    anchor.current = item === undefined ? null : { itemId: item.id, index };
  };
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
        scrollToTop();
      }
      return;
    }
    noteAnchor();
  });

  // A small scroll does not render the grid again until it ends, so the item is noted once more
  // when leaving: opening an item right after scrolling returns to what was seen.
  const leave = useRef(() => onLeave(anchor.current));
  useLayoutEffect(() => {
    leave.current = () => {
      if (columns !== 0 && columns === laidOutColumns.current) noteAnchor();
      onLeave(anchor.current);
    };
  });
  useEffect(() => () => leave.current(), []);

  return (
    <div
      ref={container}
      className="item-grid"
      role="list"
      aria-label={label}
      style={{
        height: virtualizer.getTotalSize(),
        // A card reached with Tab is scrolled into view by the browser below the toolbar (see the
        // styles). Only the cards: on the whole scrolling area, the toolbar's own controls would
        // count as hidden, and focusing them would scroll the page.
        ['--covered-top' as string]: `${covered}px`,
      }}
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
              <ItemCard
                item={item}
                title={titleOf(item)}
                coverWidth={cardWidth}
                showKind={showKind}
                selected={selection ? selection.selected.has(item.id) : null}
                onOpen={() => (selection ? selection.onToggle(item.id) : onOpenItem(item))}
              />
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
  coverWidth,
  showKind,
  selected,
  onOpen,
}: {
  item: ItemSummary;
  title: string;
  /** The width the cover is shown at, in CSS pixels: the card's. */
  coverWidth: number;
  showKind: boolean;
  /** Whether it is marked, in "Select" mode; null outside it. */
  selected: boolean | null;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const [coverMissing, setCoverMissing] = useState(false);
  const cover = coverMissing ? null : item.cover;

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
            sizes={`${Math.ceil(coverWidth)}px`}
            whenMissing="nothing"
            onMissing={() => setCoverMissing(true)}
          />
        </span>
      )}
      <span className="item-card__title">{title}</span>
      {showKind && <span className="item-card__meta">{t(`items.kind.${item.kind}`)}</span>}
      {item.isFavorite && (
        <span className="item-card__favorite" aria-label={t('items.fields.favorite')}>
          <HeartIcon filled />
        </span>
      )}
    </button>
  );
}
