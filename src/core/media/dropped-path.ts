/** Why the path of a dropped file is refused before anything is read. */
export type DroppedPathProblem = 'media.not_on_disk' | 'media.network_path';

/**
 * Checks the path of a file dropped on the window, before it is read. Unlike a path chosen in
 * the file dialog, a dropped file may come from anywhere, so only files on this computer are
 * accepted:
 *
 * - An empty path is a file with nothing on disk behind it (an image dragged from a web
 *   browser, or a `File` the page made itself).
 * - Paths that start with two slashes are refused: `\\server\share\…` (and `\\?\UNC\…`) is a
 *   network location, and on Windows opening one may send the server a hash of the session's
 *   password (NTLM). Device paths (`\\.\…`, `\\?\…`) are refused with them.
 * - Anything else that is not an absolute path (`C:\…` or `/…`) is not a file on disk either.
 *
 * Returns null when the path may be read.
 */
export function droppedPathProblem(path: string): DroppedPathProblem | null {
  if (/^[\\/]{2}/.test(path)) return 'media.network_path';
  if (/^[A-Za-z]:[\\/]/.test(path) || path.startsWith('/')) return null;
  return 'media.not_on_disk';
}
