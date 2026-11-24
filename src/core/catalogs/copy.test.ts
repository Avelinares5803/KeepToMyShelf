import { describe, expect, it } from 'vitest';
import { splitCopy } from './copy';

const values = (...names: string[]) => names.map((name) => ({ name }));

describe('splitCopy', () => {
  it('leaves out the values with exactly the same name, keeping the order', () => {
    expect(splitCopy(values('Sega', 'Nintendo', 'Atari'), new Set(['Nintendo']))).toEqual({
      added: values('Sega', 'Atari'),
      existing: 1,
    });
  });

  it('copies the names that only differ in case or accents', () => {
    expect(splitCopy(values('HIPO', 'Hipó', 'Hipo'), new Set(['Hipo']))).toEqual({
      added: values('HIPO', 'Hipó'),
      existing: 1,
    });
  });
});
