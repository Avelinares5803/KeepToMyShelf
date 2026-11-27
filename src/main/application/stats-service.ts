import type { ItemKind } from '../../shared/content';
import type { LibraryStats } from '../../shared/stats';
import { readLibraryStats } from '../infrastructure/db/library-stats-reader';
import type { SessionManager } from './session-manager';

export interface StatsServiceDeps {
  readonly sessions: SessionManager;
}

/** Statistics of the open profile's library. Items in the trash are never counted. */
export class StatsService {
  constructor(private readonly deps: StatsServiceDeps) {}

  /** Of one kind, or of every kind when `kind` is null. */
  get(token: string, kind: ItemKind | null): LibraryStats {
    return readLibraryStats(this.deps.sessions.require(token).db, kind);
  }
}
