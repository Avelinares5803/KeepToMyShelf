import { fileURLToPath } from 'node:url';
import type { Session, WebFrameMain } from 'electron';

/**
 * The app needs no web permission (camera, microphone, location, notifications...). Electron
 * grants every one a page asks for unless told otherwise, so all of them are refused.
 */
export function denyAllPermissions(session: Session): void {
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
}

/**
 * Whether `url` is the app's own page, `pageUrl` (its index.html, or the development server).
 * Its hash and query do not matter; a file page must be the very same file.
 */
export function isAppPageUrl(url: string, pageUrl: string): boolean {
  let actual: URL;
  let expected: URL;
  try {
    actual = new URL(url);
    expected = new URL(pageUrl);
  } catch {
    return false;
  }
  if (expected.protocol === 'file:') {
    if (actual.protocol !== 'file:' || actual.host !== expected.host) return false;
    // Chromium and Node may encode a path differently ("á", spaces); Windows ignores case.
    const path = (value: URL) => {
      const text = fileURLToPath(value);
      return process.platform === 'win32' ? text.toLowerCase() : text;
    };
    return path(actual) === path(expected);
  }
  return actual.origin === expected.origin;
}

/**
 * Whether an IPC message comes from the app's page itself: the top frame of the window showing
 * `pageUrl`, never a frame inside it or any other content.
 */
export function isTrustedSender(frame: WebFrameMain | null, pageUrl: string): boolean {
  return frame !== null && frame.parent === null && isAppPageUrl(frame.url, pageUrl);
}
