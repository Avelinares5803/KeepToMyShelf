import { mkdirSync } from 'node:fs';
import { AppError, NotFoundError } from '../../core/errors';
import type { Language } from '../../shared/settings';
import type { SqliteDatabase } from '../infrastructure/db/connection';
import { seedDefaultCatalogs } from '../infrastructure/db/default-catalogs';
import { openLibraryDatabase } from '../infrastructure/db/library-database';
import type { DataPaths } from '../infrastructure/paths';

export interface ProfileSession {
  readonly token: string;
  readonly profileId: string;
  readonly db: SqliteDatabase;
}

export interface SessionManagerDeps {
  readonly appDb: SqliteDatabase;
  readonly paths: DataPaths;
  readonly now: () => Date;
  readonly newId: () => string;
  /** Current language of a profile, used to load the default catalogs the first time. */
  readonly languageOf: (profileId: string) => Language;
}

/**
 * Keeps at most one profile open. Every request about library data must present the
 * session token; a token from a previous session is rejected, so data can never be written
 * to the wrong profile while switching.
 */
export class SessionManager {
  private current: ProfileSession | null = null;

  constructor(private readonly deps: SessionManagerDeps) {}

  open(profileId: string): { token: string; profileId: string } {
    const { appDb, paths, now, newId } = this.deps;
    if (!appDb.prepare('SELECT 1 FROM profile WHERE id = ?').get(profileId)) {
      throw new NotFoundError('profile.not_found', `Profile ${profileId} does not exist`);
    }

    this.closeCurrent();
    mkdirSync(paths.profileDir(profileId), { recursive: true });
    const db = openLibraryDatabase(paths.libraryDatabase(profileId));
    // Profiles created before catalogs existed get the default lists on their next opening.
    seedDefaultCatalogs(db, this.deps.languageOf(profileId));
    appDb
      .prepare('UPDATE profile SET last_opened_at = ? WHERE id = ?')
      .run(now().toISOString(), profileId);

    this.current = { token: newId(), profileId, db };
    return { token: this.current.token, profileId };
  }

  /** Throws if `token` does not belong to the open session. */
  require(token: string): ProfileSession {
    if (this.current === null || this.current.token !== token) {
      throw new AppError('session.stale', 'The session is closed or belongs to another profile');
    }
    return this.current;
  }

  close(token: string): void {
    this.require(token);
    this.closeCurrent();
  }

  isOpen(profileId: string): boolean {
    return this.current?.profileId === profileId;
  }

  /** Closes the open profile, if any (e.g. when the app quits). */
  closeCurrent(): void {
    this.current?.db.close();
    this.current = null;
  }
}
