/** What the height of a row depends on, in pixels. */
export interface GridMetrics {
  readonly cardWidth: number;
  /** Height of a card without a cover. */
  readonly plainCardHeight: number;
  /** What a card with a cover adds to its image: the title, usually in one line. */
  readonly titleHeight: number;
  readonly rowGap: number;
}

/** As many columns of at least `minCardWidth` as fit, like CSS `auto-fill`; always one. */
export function columnCountFor(width: number, minCardWidth: number, columnGap: number): number {
  return Math.max(1, Math.floor((width + columnGap) / (minCardWidth + columnGap)));
}

export function cardWidthFor(width: number, columns: number, columnGap: number): number {
  return (width - columnGap * (columns - 1)) / columns;
}

export const rowCountFor = (itemCount: number, columns: number): number =>
  Math.ceil(itemCount / columns);

export function itemsInRow<T>(items: readonly T[], rowIndex: number, columns: number): T[] {
  return items.slice(rowIndex * columns, (rowIndex + 1) * columns);
}

export const rowOfItem = (itemIndex: number, columns: number): number =>
  Math.floor(itemIndex / columns);

interface CoverSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Height of a row before it is drawn: that of its tallest card, whose cover fills the card's
 * width and keeps its proportions. The real height replaces it once the row is measured.
 */
export function estimateRowHeight(
  items: readonly { readonly cover: CoverSize | null }[],
  metrics: GridMetrics,
): number {
  const tallest = Math.max(
    metrics.plainCardHeight,
    ...items.map(({ cover }) =>
      cover === null ? 0 : (metrics.cardWidth * cover.height) / cover.width + metrics.titleHeight,
    ),
  );
  return tallest + metrics.rowGap;
}
