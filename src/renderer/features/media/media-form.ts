import { cleanDocumentLabel, labelFromFileName } from '../../../core/media/document-label';
import type { ImageStorageChoice } from '../../../core/media/import-rules';
import type {
  DocumentPlanEntry,
  ImagePlanEntry,
  MediaAttachment,
  PreparedImport,
} from '../../../shared/media';

/**
 * One image in the edit form, as the cover or in the gallery: one the item already has
 * (possibly to be replaced by its kept original) or an import prepared but not saved yet.
 * Nothing is saved until the item is.
 */
export type FormImage =
  | {
      readonly key: string;
      readonly source: 'existing';
      readonly media: MediaAttachment;
      readonly useOriginal: boolean;
    }
  | {
      readonly key: string;
      readonly source: 'prepared';
      readonly prepared: PreparedImport;
      readonly choice: ImageStorageChoice;
    };

export const fromAttachment = (media: MediaAttachment): FormImage => ({
  key: `media:${media.mediaId}`,
  source: 'existing',
  media,
  useOriginal: false,
});

export const fromAttachments = (images: readonly MediaAttachment[]): FormImage[] =>
  images.map(fromAttachment);

export const preparedImage = (prepared: PreparedImport, choice: ImageStorageChoice): FormImage => ({
  key: `prepared:${prepared.id}`,
  source: 'prepared',
  prepared,
  choice,
});

/** Moves an image or a document one place earlier or later, never past the ends. */
export function moveImage<T>(items: readonly T[], index: number, offset: -1 | 1): T[] {
  const target = index + offset;
  if (target < 0 || target >= items.length) return [...items];
  const moved = [...items];
  [moved[index], moved[target]] = [moved[target]!, moved[index]!];
  return moved;
}

/** Switches an optimized image between its copy and its kept original. */
export function withOriginalToggled(image: FormImage): FormImage {
  return image.source === 'existing' && image.media.hasOriginal
    ? { ...image, useOriginal: !image.useOriginal }
    : image;
}

/** Switches between an optimized image of the gallery and its kept original. */
export function toggleOriginal(images: readonly FormImage[], index: number): FormImage[] {
  return images.map((image, i) => (i === index ? withOriginalToggled(image) : image));
}

/**
 * True when two entries are the same image: the same stored file or the same import, however
 * it is kept. Used to mark the gallery image that is also the cover.
 */
export const sameImage = (a: FormImage | null, b: FormImage | null): boolean =>
  a !== null &&
  b !== null &&
  (a.source === 'existing'
    ? b.source === 'existing' && a.media.mediaId === b.media.mediaId
    : b.source === 'prepared' && a.prepared.id === b.prepared.id);

/** How one image is sent with the item when it is saved. */
export function toPlanEntry(image: FormImage): ImagePlanEntry {
  if (image.source === 'prepared') {
    return { kind: 'prepared', preparedId: image.prepared.id, choice: image.choice };
  }
  return image.useOriginal
    ? { kind: 'use_original', mediaId: image.media.mediaId }
    : { kind: 'existing', mediaId: image.media.mediaId };
}

/** The gallery sent with the item when it is saved. */
export const toImagePlan = (images: readonly FormImage[]): ImagePlanEntry[] =>
  images.map(toPlanEntry);

/** The cover sent with the item when it is saved; null removes it. */
export const toCoverPlan = (cover: FormImage | null): ImagePlanEntry | null =>
  cover === null ? null : toPlanEntry(cover);

export const imagesChanged = (saved: readonly FormImage[], current: readonly FormImage[]) =>
  JSON.stringify(toImagePlan(saved)) !== JSON.stringify(toImagePlan(current));

export const coverChanged = (saved: FormImage | null, current: FormImage | null) =>
  JSON.stringify(toCoverPlan(saved)) !== JSON.stringify(toCoverPlan(current));

/** The imports used by the cover and the gallery, each once. */
export const preparedIds = (cover: FormImage | null, images: readonly FormImage[]): string[] => [
  ...new Set(
    [...(cover ? [cover] : []), ...images].flatMap((image) =>
      image.source === 'prepared' ? [image.prepared.id] : [],
    ),
  ),
];

/**
 * One document in the edit form, with the name the user may change: one the item already has
 * or a PDF prepared but not saved yet. Nothing is saved until the item is.
 */
export type FormDocument =
  | {
      readonly key: string;
      readonly source: 'existing';
      readonly media: MediaAttachment;
      readonly label: string;
    }
  | {
      readonly key: string;
      readonly source: 'prepared';
      readonly prepared: PreparedImport;
      readonly label: string;
    };

export const fromDocumentAttachments = (documents: readonly MediaAttachment[]): FormDocument[] =>
  documents.map((media) => ({
    key: `media:${media.mediaId}`,
    source: 'existing',
    media,
    label: media.label ?? '',
  }));

/** A PDF just chosen: its name starts as the file name without ".pdf". */
export const preparedDocument = (prepared: PreparedImport): FormDocument => ({
  key: `prepared:${prepared.id}`,
  source: 'prepared',
  prepared,
  label: labelFromFileName(prepared.fileName),
});

export const renameDocument = (
  documents: readonly FormDocument[],
  index: number,
  label: string,
): FormDocument[] =>
  documents.map((document, i) => (i === index ? { ...document, label } : document));

/** The documents sent with the item when it is saved. */
export const toDocumentPlan = (documents: readonly FormDocument[]): DocumentPlanEntry[] =>
  documents.map((document) =>
    document.source === 'prepared'
      ? { kind: 'prepared', preparedId: document.prepared.id, label: document.label }
      : { kind: 'existing', mediaId: document.media.mediaId, label: document.label },
  );

export const documentsChanged = (
  saved: readonly FormDocument[],
  current: readonly FormDocument[],
) => JSON.stringify(toDocumentPlan(saved)) !== JSON.stringify(toDocumentPlan(current));

export const preparedDocumentIds = (documents: readonly FormDocument[]): string[] =>
  documents.flatMap((document) => (document.source === 'prepared' ? [document.prepared.id] : []));

/**
 * Checks the documents' names before saving, like the main process does; throws the error of
 * the first one that is not valid.
 */
export function assertDocumentLabels(documents: readonly FormDocument[]): void {
  for (const document of documents) cleanDocumentLabel(document.label);
}

/** Animated images can only be kept as they are. */
export const choicesFor = (prepared: PreparedImport): readonly ImageStorageChoice[] =>
  prepared.optimized === null
    ? ['original']
    : ['original', 'optimized_with_original', 'optimized_only'];

/** True when the optimized copy would not take less space than the original. */
export const optimizingSavesNothing = (prepared: PreparedImport): boolean =>
  prepared.optimized !== null && prepared.optimized.byteSize >= prepared.byteSize;

/**
 * How to keep an image without asking, following a remembered (or "apply to the rest")
 * choice: an optimized copy that would not be smaller, or of an animated image, is pointless,
 * so the original is kept instead.
 */
export function automaticChoice(
  prepared: PreparedImport,
  choice: ImageStorageChoice,
): ImageStorageChoice {
  if (choice === 'original' || !choicesFor(prepared).includes(choice)) return 'original';
  return optimizingSavesNothing(prepared) ? 'original' : choice;
}
