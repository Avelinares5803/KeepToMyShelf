import { join } from 'node:path';

/**
 * Layout of the app's data folder (%APPDATA%\KeepToMyShelf on Windows):
 *
 *   app.db                      profile registry and preferences
 *   profiles/<id>/library.db    one library per profile
 *   profiles/.deleted-<id>/     folder of a deleted profile awaiting removal
 */
export interface DataPaths {
  readonly root: string;
  readonly appDatabase: string;
  readonly profilesDir: string;
  profileDir(profileId: string): string;
  libraryDatabase(profileId: string): string;
  deletedProfileDir(profileId: string): string;
}

export const DELETED_PROFILE_PREFIX = '.deleted-';

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
  return {
    root,
    appDatabase: join(root, 'app.db'),
    profilesDir,
    profileDir,
    libraryDatabase: (profileId) => join(profileDir(profileId), 'library.db'),
    deletedProfileDir: (profileId) =>
      join(profilesDir, `${DELETED_PROFILE_PREFIX}${assertProfileId(profileId)}`),
  };
}
