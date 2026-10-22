import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Creates a temporary directory whose name contains non-ASCII characters, like real user paths. */
export function createTempDir(): { path: string; remove: () => void } {
  const path = mkdtempSync(join(tmpdir(), 'ktms-ñáü-'));
  return { path, remove: () => rmSync(path, { recursive: true, force: true }) };
}
