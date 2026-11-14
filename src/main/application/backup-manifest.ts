import { z } from 'zod';
import { AppError } from '../../core/errors';
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, type BackupManifest } from '../../shared/backups';

/**
 * A manifest read from a backup. Its preferences are left unchecked here: each one is
 * checked when it is applied, and one that is not valid (or unknown, from a newer app) is
 * skipped without refusing the whole backup.
 */
export type ReadManifest = Omit<BackupManifest, 'settings' | 'reason'> & {
  readonly reason: string;
  readonly settings: Readonly<Record<string, unknown>>;
};

/** Only what tells a KeepToMyShelf backup apart, so a newer format is reported as such. */
const formatSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.number().int().positive(),
});

const count = z.number().int().nonnegative();

const manifestSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.number().int().positive(),
  appVersion: z.string().max(100),
  createdAt: z.iso.datetime(),
  reason: z.string().max(100),
  profile: z.object({ name: z.string().max(1_000), createdAt: z.string().max(100) }),
  librarySchemaVersion: z.number().int().positive(),
  settings: z.record(z.string().max(100), z.unknown()),
  importedBackground: z.object({ sha256: z.string().regex(/^[0-9a-f]{64}$/) }).optional(),
  media: z.object({ files: count, bytes: count, missing: count }),
});

/** Reads `manifest.json`: `backup.invalid_file` if it is not one, `backup.too_new` if newer. */
export function parseBackupManifest(bytes: Buffer): ReadManifest {
  let json: unknown;
  try {
    json = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw invalidFile('The manifest is not JSON', error);
  }
  const format = formatSchema.safeParse(json);
  if (!format.success) throw invalidFile('Not a KeepToMyShelf backup');
  if (format.data.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new AppError(
      'backup.too_new',
      `Backup format v${format.data.formatVersion} is newer than supported v${BACKUP_FORMAT_VERSION}`,
    );
  }
  const manifest = manifestSchema.safeParse(json);
  if (!manifest.success) {
    throw invalidFile(`Invalid manifest: ${z.prettifyError(manifest.error)}`);
  }
  return manifest.data;
}

export function invalidFile(message: string, cause?: unknown): AppError {
  return new AppError('backup.invalid_file', message, cause === undefined ? {} : { cause });
}
