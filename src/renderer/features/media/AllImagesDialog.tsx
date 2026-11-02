import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { MediaAttachment } from '../../../shared/media';
import { ImageGrid } from './ImageStrip';

interface AllImagesDialogProps {
  title: string;
  images: readonly MediaAttachment[];
  onOpen: (index: number) => void;
  onClose: () => void;
}

/** Every image of an item over the whole window; choosing one opens it in the viewer. */
export function AllImagesDialog({ title, images, onOpen, onClose }: AllImagesDialogProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog ref={ref} className="gallery" aria-labelledby={titleId} onClose={onClose}>
      <header className="gallery__header">
        <h2 id={titleId} className="gallery__title">
          {t('media.view.allTitle', { title, count: images.length })}
        </h2>
        <button
          type="button"
          className="viewer__button"
          aria-label={t('common.close')}
          autoFocus
          onClick={() => ref.current?.close()}
        >
          ×
        </button>
      </header>
      <ImageGrid className="gallery__grid" images={images} onOpen={onOpen} />
    </dialog>
  );
}
