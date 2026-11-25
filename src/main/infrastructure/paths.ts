import { join } from 'node:path';

/**
 * Layout of the app's data folder (%APPDATA%\KeepToMyShelf on Windows):
 *
 *   app.db                      profile registry and preferences
 *   profiles/<id>/library.db    one library per profile
 *   profiles/<id>/media/        imported images and documents
 *   profiles/<id>/cache/        thumbnails, which can always be regenerated
 *   profiles/.deleted-<id>/     folder of a deleted profile awaiting removal
 *   profiles/.restoring-<id>/   a backup being restored, before it becomes a profile's folder
 *   backgrounds/                imported backgrounds, shared by every profile
 *   backups/                    automatic backups of profiles (and app.db's pre-migration copies)
 *   backups/scheduled/<id>/     scheduled backups of each profile
 *   backups/scheduled/.deleted-<id>/  those of a deleted profile awaiting removal
 *   window-state.json           size, position, maximized and full screen of the window at exit
 */
export interface DataPaths {
  readonly root: string;
  readonly appDatabase: string;
  readonly windowStateFile: string;
  readonly profilesDir: string;
  readonly backgroundsDir: string;
  readonly backupsDir: string;
  profileDir(profileId: string): string;
  libraryDatabase(profileId: string): string;
  mediaDir(profileId: string): string;
  cacheDir(profileId: string): string;
  deletedProfileDir(profileId: string): string;
  /** Parent of every profile's scheduled backups. */
  readonly scheduledBackupsRoot: string;
  scheduledBackupsDir(profileId: string): string;
  deletedScheduledBackupsDir(profileId: string): string;
  /** Where a backup is extracted and checked; `id` is a new UUID for each restore. */
  restoringDir(id: string): string;
}

export const DELETED_PROFILE_PREFIX = '.deleted-';
export const RESTORING_PROFILE_PREFIX = '.restoring-';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Profile ids become folder names: only UUIDs are accepted, so no id can escape the folder. */
function assertProfileId(profileId: string): string {
  if (!UUID.test(profileId)) {
    throw new Error(`Invalid profile id: ${profileId}`);
  }
  return profileId;
}

export function createDataPaths(root: string): DataPaths {
  const profilesDir = join(root, 'profiles');
  const profileDir = (profileId: string) => join(profilesDir, assertProfileId(profileId));
  const scheduledBackupsRoot = join(root, 'backups', 'scheduled');
  return {
    root,
    appDatabase: join(root, 'app.db'),
    windowStateFile: join(root, 'window-state.json'),
    profilesDir,
    backgroundsDir: join(root, 'backgrounds'),
    backupsDir: join(root, 'backups'),
    profileDir,
    libraryDatabase: (profileId) => join(profileDir(profileId), 'library.db'),
    mediaDir: (profileId) => join(profileDir(profileId), 'media'),
    cacheDir: (profileId) => join(profileDir(profileId), 'cache'),
    deletedProfileDir: (profileId) =>
      join(profilesDir, `${DELETED_PROFILE_PREFIX}${assertProfileId(profileId)}`),
    scheduledBackupsRoot,
    scheduledBackupsDir: (profileId) => join(scheduledBackupsRoot, assertProfileId(profileId)),
    deletedScheduledBackupsDir: (profileId) =>
      join(scheduledBackupsRoot, `${DELETED_PROFILE_PREFIX}${assertProfileId(profileId)}`),
    restoringDir: (id) => join(profilesDir, `${RESTORING_PROFILE_PREFIX}${assertProfileId(id)}`),
  };
}
