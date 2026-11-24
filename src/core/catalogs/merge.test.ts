import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors';
import { CATALOG_MAX_ALIASES } from './catalogs';
import { aliasesGained, findDuplicates, mergeAliases, mergeScope } from './merge';

let nextId = 1;
const entry = (name: string, aliases: string[] = [], total = 0) => ({
  id: nextId++,
  name,
  aliases,
  usage: { total },
});
const pairs = (entries: ReturnType<typeof entry>[]) =>
  findDuplicates(entries).map(({ source, target, by }) => [source.name, target.name, by]);

describe('aliasesGained', () => {
  it('are the name and the other names of the merged value', () => {
    expect(
      aliasesGained(entry('Square Enix', ['SE']), entry('SquareEnix', ['Square', 'SE'])),
    ).toEqual(['SquareEnix', 'Square']);
  });

  it('leave out what only differs in case or accents from a name already there', () => {
    expect(
      aliasesGained(
        entry('PlayStation 5', ['PS5']),
        entry('Playstation 5', ['ps5', 'Play 5', 'PLAY 5']),
      ),
    ).toEqual(['Play 5']);
  });
});

describe('mergeAliases', () => {
  const many = (count: number) => Array.from({ length: count }, (_, i) => `Alias ${i}`);

  it('keeps the other names of the kept value, in order, and adds the new ones', () => {
    expect(mergeAliases(entry('A', ['z', 'y']), entry('B', ['x']))).toEqual(['z', 'y', 'B', 'x']);
  });

  it('accepts exactly the maximum and fails above it', () => {
    expect(mergeAliases(entry('A', many(CATALOG_MAX_ALIASES - 1)), entry('B'))).toHaveLength(
      CATALOG_MAX_ALIASES,
    );
    expect(() => mergeAliases(entry('A', many(CATALOG_MAX_ALIASES)), entry('B'))).toThrow(
      expect.objectContaining({ code: 'catalog.merge_too_many_aliases' }) as ValidationError,
    );
  });
});

describe('mergeScope', () => {
  it('keeps an equal scope and widens different ones to both', () => {
    expect(mergeScope('movie', 'movie')).toBe('movie');
    expect(mergeScope(null, null)).toBe(null);
    expect(mergeScope('movie', 'series')).toBe(null);
    expect(mergeScope('movie', null)).toBe(null);
    expect(mergeScope(null, 'series')).toBe(null);
  });
});

describe('findDuplicates', () => {
  it('finds nothing among different values', () => {
    expect(pairs([entry('Sega', ['SEGA Corp.']), entry('Sega AM2'), entry('Nintendo')])).toEqual(
      [],
    );
  });

  it('pairs names that only differ in case or accents, keeping the most used', () => {
    expect(
      pairs([entry('HIPO', [], 1), entry('Hipó', [], 5), entry('hipo'), entry('Otro')]),
    ).toEqual([
      ['HIPO', 'Hipó', 'name'],
      ['hipo', 'Hipó', 'name'],
    ]);
  });

  it('keeps the first one when they are used the same', () => {
    expect(pairs([entry('A'), entry('a')])).toEqual([['a', 'A', 'name']]);
  });

  it('pairs a value with the one it is another name of, even if it is used more', () => {
    expect(pairs([entry('Génesis', [], 9), entry('Mega Drive', ['Genesis'])])).toEqual([
      ['Génesis', 'Mega Drive', 'alias'],
    ]);
  });

  it('suggests each pair once', () => {
    expect(pairs([entry('A', ['B']), entry('B', ['A'])])).toHaveLength(1);
    expect(pairs([entry('A', ['a']), entry('a', ['A'])])).toEqual([['a', 'A', 'name']]);
    expect(pairs([entry('A', ['b', 'B']), entry('B')])).toHaveLength(1);
  });

  it('does not pair a value with itself', () => {
    expect(pairs([entry('A', ['Á'])])).toEqual([]);
  });

  it('does not pair values that only share another name', () => {
    expect(pairs([entry('A', ['X']), entry('B', ['X'])])).toEqual([]);
  });
});
