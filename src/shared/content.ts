/** The three kinds of items, matching `item.kind` in the library database. */
export const ITEM_KINDS = ['game', 'movie', 'series'] as const;

export type ItemKind = (typeof ITEM_KINDS)[number];
