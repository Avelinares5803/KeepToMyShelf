import { describe, expect, it } from 'vitest';
import { mediaEntryName, parseBackupEntryName } from './backup-entries';

const sha = 'ab'.padEnd(64, '0');

describe('parseBackupEntryName', () => {
  it('accepts the manifest, the library and the stored files', () => {
    expect(parseBackupEntryName('manifest.json')).toEqual({ kind: 'manifest' });
    expect(parseBackupEntryName('library.db')).toEqual({ kind: 'library' });
    expect(parseBackupEntryName(`media/files/ab/${sha}.webp`)).toEqual({
      kind: 'media',
      store: 'files',
      sha256: sha,
      format: 'webp',
    });
    expect(parseBackupEntryName(`media/originals/ab/${sha}.jpg`)).toMatchObject({
      store: 'originals',
      format: 'jpeg',
    });
    expect(parseBackupEntryName(`media/files/ab/${sha}.pdf`)).toMatchObject({ format: 'pdf' });
  });

  it.each([
    ['a path that climbs out', '../evil.txt'],
    ['a path that climbs out inside media', `media/files/ab/../../../${sha}.webp`],
    ['an absolute path', `/media/files/ab/${sha}.webp`],
    ['a Windows drive', `C:/media/files/ab/${sha}.webp`],
    ['backslashes', `media\\files\\ab\\${sha}.webp`],
    ['a folder', 'media/'],
    ['another store', `media/cache/ab/${sha}.webp`],
    ['a subfolder that is not the start of the hash', `media/files/cd/${sha}.webp`],
    ['a name that is not a hash', 'media/files/ab/abc.webp'],
    ['an upper-case hash', `media/files/AB/${sha.toUpperCase()}.webp`],
    ['an extension that is not accepted', `media/files/ab/${sha}.svg`],
    ['the jpeg spelling', `media/files/ab/${sha}.jpeg`],
    ['an inherited property name', `media/files/ab/${sha}.constructor`],
    ['a thumbnail', `cache/thumbs/ab/${sha}-320.webp`],
    ['another file', 'notes.txt'],
    ['a manifest in a folder', 'x/manifest.json'],
  ])('rejects %s', (_case, name) => {
    expect(parseBackupEntryName(name)).toBeNull();
  });
});

describe('mediaEntryName', () => {
  it('is the name parseBackupEntryName reads back', () => {
    const name = mediaEntryName('originals', sha, 'jpeg');

    expect(name).toBe(`media/originals/ab/${sha}.jpg`);
    expect(parseBackupEntryName(name)).toEqual({
      kind: 'media',
      store: 'originals',
      sha256: sha,
      format: 'jpeg',
    });
  });

  it('refuses what is not a hash', () => {
    expect(() => mediaEntryName('files', '../x', 'png')).toThrow();
  });
});
