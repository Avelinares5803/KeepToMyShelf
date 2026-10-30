import type { TFunction } from 'i18next';
import type { ItemRole } from '../../../core/catalogs/catalogs';
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

/** "Release dates" for games, "Premiere dates" for movies and series. */
export const releasesLabel = (t: TFunction, kind: ItemKind) => t(`items.releases.${grammar(kind)}`);

/** Name of a role in the form and the detail view ("Developers", "Cast"...). */
export const roleLabel = (t: TFunction, role: ItemRole) => t(`items.roles.${role}`);

/** Roles of the "Details" section, in the order the form and the detail view show them. */
export function sheetRoles(kind: ItemKind): ItemRole[] {
  return kind === 'game'
    ? ['released_on', 'genre', 'publisher', 'developer', 'composer', 'origin_country']
    : ['genre', 'producer', 'director', 'actor', 'composer', 'origin_country'];
}
