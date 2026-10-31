import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDataPaths } from './paths';

describe('createDataPaths', () => {
  const root = join('C:', 'Users', 'Adrián', 'AppData', 'Roaming', 'KeepToMyShelf');
  const paths = createDataPaths(root);
  const id = '3f2b8c1e-5d4a-4b6f-9e8d-7c6b5a493827';

  it('places every file inside the data folder', () => {
    expect(paths.appDatabase).toBe(join(root, 'app.db'));
    expect(paths.profileDir(id)).toBe(join(root, 'profiles', id));
    expect(paths.libraryDatabase(id)).toBe(join(root, 'profiles', id, 'library.db'));
    expect(paths.mediaDir(id)).toBe(join(root, 'profiles', id, 'media'));
    expect(paths.cacheDir(id)).toBe(join(root, 'profiles', id, 'cache'));
    expect(paths.deletedProfileDir(id)).toBe(join(root, 'profiles', `.deleted-${id}`));
  });

  it.each(['..', '../../Windows', 'C:\\Windows', 'not-a-uuid', ''])(
    'rejects profile id %j so it cannot escape the profiles folder',
    (badId) => {
      expect(() => paths.profileDir(badId)).toThrow(/Invalid profile id/);
      expect(() => paths.libraryDatabase(badId)).toThrow(/Invalid profile id/);
      expect(() => paths.mediaDir(badId)).toThrow(/Invalid profile id/);
      expect(() => paths.cacheDir(badId)).toThrow(/Invalid profile id/);
      expect(() => paths.deletedProfileDir(badId)).toThrow(/Invalid profile id/);
    },
  );
});
