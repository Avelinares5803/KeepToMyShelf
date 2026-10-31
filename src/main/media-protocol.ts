import { isThumbnailSize, type ThumbnailSize } from '../core/media/import-rules';
import { isSha256Hex } from '../core/media/media-format';
import type { MediaService } from './application/media-service';

/**
 * The UI shows stored images through this scheme instead of file:// URLs, so it never gets
 * access to the disk:
 *
 *   ktms-media://file/<sha256>           a file items use
 *   ktms-media://thumb/<sha256>/<size>   its thumbnail (320 or 640 px on the longest side)
 */
export const MEDIA_SCHEME = 'ktms-media';

export type MediaRequest =
  | { readonly type: 'file'; readonly sha256: string }
  | { readonly type: 'thumb'; readonly sha256: string; readonly size: ThumbnailSize };

/** Parses a media URL strictly; anything unexpected (extra parts, "..", queries) is null. */
export function parseMediaUrl(url: string): MediaRequest | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${MEDIA_SCHEME}:` || parsed.search !== '' || parsed.hash !== '') {
    return null;
  }
  if (parsed.username !== '' || parsed.password !== '' || parsed.port !== '') return null;
  const parts = parsed.pathname.split('/').slice(1);
  const [sha256, size] = parts;
  if (sha256 === undefined || !isSha256Hex(sha256)) return null;

  if (parsed.hostname === 'file' && parts.length === 1) return { type: 'file', sha256 };
  if (parsed.hostname === 'thumb' && parts.length === 2 && /^\d+$/.test(size!)) {
    const value = Number(size);
    if (isThumbnailSize(value)) return { type: 'thumb', sha256, size: value };
  }
  return null;
}

/**
 * Answers `ktms-media://` requests. Written against the web `Request`/`Response` types, so it
 * runs (and is tested) without Electron; main/index.ts registers it with `protocol.handle`.
 */
export function createMediaProtocolHandler(
  media: Pick<MediaService, 'readForProtocol'>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== 'GET') return new Response(null, { status: 405 });
    const target = parseMediaUrl(request.url);
    if (target === null) return new Response(null, { status: 400 });

    const found = await media.readForProtocol(
      target.sha256,
      target.type === 'thumb' ? target.size : null,
    );
    if (found === null) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(found.bytes), {
      status: 200,
      headers: {
        'Content-Type': found.mimeType,
        // The browser must trust the stored type and never guess another one from the bytes.
        'X-Content-Type-Options': 'nosniff',
      },
    });
  };
}
