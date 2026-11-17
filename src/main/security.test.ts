import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isAppPageUrl, isTrustedSender } from './security';

const indexHtml = join('C:', 'Users', 'Adrián', 'KeepToMyShelf', 'resources', 'index.html');
const filePage = pathToFileURL(indexHtml).href;
const devPage = 'http://localhost:5173/';

describe('isAppPageUrl', () => {
  it('accepts the page itself, with any hash or query', () => {
    expect(isAppPageUrl(filePage, filePage)).toBe(true);
    expect(isAppPageUrl(`${filePage}#/library`, filePage)).toBe(true);
    expect(isAppPageUrl(`${filePage}?a=1`, filePage)).toBe(true);
  });

  it('accepts the same file written differently', () => {
    // Chromium may leave "á" unencoded or change the case of the drive letter.
    const other = filePage.replace('Adri%C3%A1n', 'Adrián').replace('file:///C:', 'file:///c:');
    expect(isAppPageUrl(other, filePage)).toBe(true);
  });

  it('rejects any other file', () => {
    const otherFile = pathToFileURL(join('C:', 'Users', 'Adrián', 'Downloads', 'index.html')).href;
    expect(isAppPageUrl(otherFile, filePage)).toBe(false);
    expect(isAppPageUrl(`${filePage}.html`, filePage)).toBe(false);
  });

  it('rejects other kinds of pages', () => {
    for (const url of [
      'https://example.com/',
      'about:blank',
      'data:text/html,hi',
      'ktms-media://file/x',
    ]) {
      expect(isAppPageUrl(url, filePage)).toBe(false);
    }
  });

  it('accepts the development server and nothing else', () => {
    expect(isAppPageUrl('http://localhost:5173/', devPage)).toBe(true);
    expect(isAppPageUrl('http://localhost:5173/src/main.tsx', devPage)).toBe(true);
    expect(isAppPageUrl('http://localhost:5174/', devPage)).toBe(false);
    expect(isAppPageUrl('https://localhost:5173/', devPage)).toBe(false);
    expect(isAppPageUrl(filePage, devPage)).toBe(false);
  });

  it('rejects what is not a URL', () => {
    expect(isAppPageUrl('', filePage)).toBe(false);
    expect(isAppPageUrl('not a url', filePage)).toBe(false);
  });
});

describe('isTrustedSender', () => {
  const frame = (url: string, parent: object | null = null) =>
    ({ url, parent }) as unknown as Parameters<typeof isTrustedSender>[0];

  it('trusts the top frame of the app page', () => {
    expect(isTrustedSender(frame(filePage), filePage)).toBe(true);
  });

  it('does not trust a frame inside the page, even with the same URL', () => {
    expect(isTrustedSender(frame(filePage, {}), filePage)).toBe(false);
  });

  it('does not trust another page or a frame that is gone', () => {
    expect(isTrustedSender(frame('https://example.com/'), filePage)).toBe(false);
    expect(isTrustedSender(null, filePage)).toBe(false);
  });
});
