import type { TFunction } from 'i18next';
import type { ItemStatus } from '../../../core/items/item-draft';
import type { ItemKind } from '../../../shared/content';

// Spanish adjectives agree in gender: "videojuego terminado", "película/serie terminada".
const grammar = (kind: ItemKind) => (kind === 'game' ? 'game' : 'screen');

export const statusLabel = (t: TFunction, kind: ItemKind, status: ItemStatus) =>
  t(`items.status.${grammar(kind)}.${status}`);

/** "Replayed" for games, "Rewatched" for movies and series. */
export const replayLabel = (t: TFunction, kind: ItemKind) => t(`items.replay.${grammar(kind)}`);

/** "Play dates" for games, "Watch dates" for movies and series. */
export const datesLabel = (t: TFunction, kind: ItemKind) => t(`items.dates.${grammar(kind)}`);
