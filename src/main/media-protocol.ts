import { isThumbnailSize, type ThumbnailSize } from '../core/media/import-rules';
import { isSha256Hex } from '../core/media/media-format';
import type { BackgroundService } from './application/background-service';
import type { MediaService } from './application/media-service';

/**
 * The UI shows stored images through this scheme instead of file:// URLs, so it never gets
 * access to the disk:
 *
 *   ktms-media://file/<sha256>                an image items use (documents are never served)
 *   ktms-media://thumb/<sha256>/<size>        its thumbnail (320 or 640 px on the longest side)
 *   ktms-media://prepared/<id>/<size>         the thumbnail of an import not saved yet
 *   ktms-media://background/<sha256>          a background of the common gallery
 *   ktms-media://background/<sha256>/<size>   its thumbnail
 */
export const MEDIA_SCHEME = 'ktms-media';

export type MediaRequest =
  | { readonly type: 'file'; readonly sha256: string }
  | { readonly type: 'thumb'; readonly sha256: string; readonly size: ThumbnailSize }
  | { readonly type: 'prepared'; readonly id: string; readonly size: ThumbnailSize }
  | {
      readonly type: 'background';
      readonly sha256: string;
      /** Null for the background itself. */
      readonly size: ThumbnailSize | null;
    };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const thumbnailSize = (text: string | undefined): ThumbnailSize | null => {
  if (text === undefined || !/^\d+$/.test(text)) return null;
  const value = Number(text);
  return isThumbnailSize(value) ? value : null;
};

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
  const [id, sizeText] = parts;
  if (id === undefined) return null;
  const size = parts.length === 2 ? thumbnailSize(sizeText) : null;

  switch (parsed.hostname) {
    case 'file':
      return parts.length === 1 && isSha256Hex(id) ? { type: 'file', sha256: id } : null;
    case 'thumb':
      return size !== null && isSha256Hex(id) ? { type: 'thumb', sha256: id, size } : null;
    case 'prepared':
      return size !== null && UUID.test(id) ? { type: 'prepared', id, size } : null;
    case 'background':
      if (!isSha256Hex(id)) return null;
      if (parts.length === 1) return { type: 'background', sha256: id, size: null };
      return size !== null ? { type: 'background', sha256: id, size } : null;
    default:
      return null;
  }
}

type Found = { bytes: Buffer; mimeType: string } | null;

/**
 * Answers `ktms-media://` requests. Written against the web `Request`/`Response` types, so it
 * runs (and is tested) without Electron; main/index.ts registers it with `protocol.handle`.
 */
export function createMediaProtocolHandler(
  media: Pick<MediaService, 'readForProtocol' | 'readPreparedThumbnail'>,
  backgrounds: Pick<BackgroundService, 'readForProtocol' | 'readPreparedThumbnail'>,
): (request: Request) => Promise<Response> {
  const read = async (target: MediaRequest): Promise<Found> => {
    switch (target.type) {
      case 'file':
        return media.readForProtocol(target.sha256, null);
      case 'thumb':
        return media.readForProtocol(target.sha256, target.size);
      case 'prepared':
        // Prepared ids are random UUIDs: an import of a cover and one of a background never
        // share one, and the import window shows both the same way.
        return (
          (await media.readPreparedThumbnail(target.id, target.size)) ??
          backgrounds.readPreparedThumbnail(target.id, target.size)
        );
      case 'background':
        return backgrounds.readForProtocol(target.sha256, target.size);
    }
  };

  return async (request) => {
    if (request.method !== 'GET') return new Response(null, { status: 405 });
    const target = parseMediaUrl(request.url);
    if (target === null) return new Response(null, { status: 400 });

    const found = await read(target);
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
