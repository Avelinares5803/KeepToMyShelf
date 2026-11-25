import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { AppError } from '../../core/errors';
import { toCsv } from '../../core/export/csv';
import { csvColumns } from '../../core/export/csv-columns';
import { exportFileName } from '../../core/export/export-file-name';
import {
  LIBRARY_EXPORT_FORMAT,
  LIBRARY_EXPORT_FORMAT_VERSION,
  type ExportedLibrary,
  type ExportSaved,
  type ExportTarget,
  type LibraryExportFile,
} from '../../shared/exports';
import type { Language } from '../../shared/settings';
import { readLibraryForExport } from '../infrastructure/db/library-export-reader';
import type { ProfileService } from './profile-service';
import type { SessionManager } from './session-manager';
import type { SettingsService } from './settings-service';

export interface ExportServiceDeps {
  readonly sessions: SessionManager;
  readonly profiles: Pick<ProfileService, 'get'>;
  readonly settings: Pick<SettingsService, 'getForProfile'>;
  readonly appVersion: string;
  readonly now: () => Date;
}

/** Exports of the open profile's library, for other programs or for another profile. */
export class ExportService {
  constructor(private readonly deps: ExportServiceDeps) {}

  /** The name offered when saving an export of the open profile. */
  suggestedFileName(token: string, target: ExportTarget): string {
    const { profileId } = this.deps.sessions.require(token);
    const { name } = this.deps.profiles.get(profileId);
    return exportFileName(name, target, this.languageOf(profileId), this.deps.now());
  }

  /**
   * Writes an export of the open profile at `destination`, chosen by the user. The library is
   * read at once, so the profile may be closed while the file is written.
   */
  async exportForSession(
    token: string,
    target: ExportTarget,
    destination: string,
  ): Promise<ExportSaved> {
    const { profileId, db } = this.deps.sessions.require(token);
    const library = readLibraryForExport(db);
    const { text, items } =
      target.format === 'json'
        ? this.toJson(library, this.deps.profiles.get(profileId).name)
        : toCsvOfKind(library, target, this.languageOf(profileId));
    await writeInPlace(destination, text);
    return { fileName: basename(destination), items };
  }

  private toJson(library: ExportedLibrary, profileName: string) {
    const file: LibraryExportFile = {
      format: LIBRARY_EXPORT_FORMAT,
      formatVersion: LIBRARY_EXPORT_FORMAT_VERSION,
      appVersion: this.deps.appVersion,
      exportedAt: this.deps.now().toISOString(),
      profile: { name: profileName },
      ...library,
    };
    return { text: `${JSON.stringify(file, null, 2)}\n`, items: library.items.length };
  }

  private languageOf(profileId: string): Language {
    return this.deps.settings.getForProfile(profileId).language;
  }
}

/** The items of one kind, without those in the trash, in the language of the profile. */
function toCsvOfKind(
  library: ExportedLibrary,
  { kind, separator }: Extract<ExportTarget, { format: 'csv' }>,
  language: Language,
) {
  const collectionsOf = new Map<string, string[]>();
  for (const collection of library.collections) {
    for (const { uuid } of collection.items) {
      const names = collectionsOf.get(uuid);
      if (names === undefined) collectionsOf.set(uuid, [collection.name]);
      else names.push(collection.name);
    }
  }
  const items = library.items.filter((item) => item.kind === kind && item.deletedAt === null);
  const columns = csvColumns(kind);
  const rows = items.map((item) => {
    const context = { language, separator, collections: collectionsOf.get(item.uuid) ?? [] };
    return columns.map((column) => column.value(item, context));
  });
  const header = columns.map((column) => column.label[language]);
  return { text: toCsv([header, ...rows], separator), items: items.length };
}

/** Renamed into place at the end: a failure never leaves half a file, nor harms an older one. */
async function writeInPlace(destination: string, text: string): Promise<void> {
  const partial = `${destination}.${randomUUID()}.partial`;
  try {
    await writeFile(partial, text, 'utf8');
    await rename(partial, destination);
  } catch (error) {
    // The handler only logs unexpected errors: this one is expected, but its cause matters.
    console.error('Export failed', error);
    await rm(partial, { force: true }).catch((cause: unknown) => {
      console.warn(`Could not remove "${partial}"`, cause);
    });
    throw new AppError('export.write_failed', `The export could not be written: ${String(error)}`, {
      cause: error,
    });
  }
}
