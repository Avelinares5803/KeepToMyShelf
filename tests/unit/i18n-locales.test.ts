import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../src/renderer/i18n/locales/en.json';
import es from '../../src/renderer/i18n/locales/es.json';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): [key: string, text: string][] {
  return Object.entries(tree).flatMap(([key, value]): [string, string][] =>
    typeof value === 'string' ? [[`${prefix}${key}`, value]] : flatten(value, `${prefix}${key}.`),
  );
}

const flattenKeys = (tree: Tree) => flatten(tree).map(([key]) => key);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

/**
 * Every error code written in application code. Codes are 'domain.code' string literals
 * (e.g. 'profile.name_empty'), found wherever they appear, even when passed in a variable.
 */
function thrownErrorCodes(): string[] {
  const pattern = /'((?:date|item|media|profile|session|settings|ipc)\.[a-z_]+)'/g;
  const codes = new Set<string>();
  // Error codes originate outside the UI; renderer keys (t('settings.title')) look alike.
  const roots = ['core', 'main', 'shared'].map((dir) => join(__dirname, '../../src', dir));
  for (const file of roots.flatMap(sourceFiles)) {
    for (const match of readFileSync(file, 'utf8').matchAll(pattern)) {
      codes.add(match[1] as string);
    }
  }
  return [...codes].sort();
}

describe('translations', () => {
  const esKeys = flattenKeys(es);
  const enKeys = flattenKeys(en);

  it('define the same keys in Spanish and English', () => {
    expect(enKeys.sort()).toEqual(esKeys.sort());
  });

  it('have no empty texts', () => {
    const empty = (tree: Tree) =>
      flatten(tree)
        .filter(([, text]) => text.trim().length === 0)
        .map(([key]) => key);
    expect(empty(es)).toEqual([]);
    expect(empty(en)).toEqual([]);
  });

  it('translate every error code thrown by the application', () => {
    const codes = thrownErrorCodes();
    expect(codes.length).toBeGreaterThan(0);
    const missing = codes.filter((code) => !esKeys.includes(`errors.${code}`));
    expect(missing).toEqual([]);
  });

  it('translate the generic IPC error codes', () => {
    for (const code of ['ipc.invalid_input', 'internal', 'unknown']) {
      expect(esKeys).toContain(`errors.${code}`);
    }
  });
});
