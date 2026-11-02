import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MediaAttachment } from '../../../shared/media';
import { fullImageSource } from '../../lib/media-url';

interface ImageViewerProps {
  images: readonly MediaAttachment[];
  startIndex: number;
  onClose: () => void;
}

/**
 * Shows one image at a time over the whole window, at full quality (the stored file, not a
 * thumbnail), fitted without distortion. Arrows and ←/→ move through the images; Escape
 * closes. Built on a native modal <dialog>, which keeps focus inside and gives it back to
 * the element that opened it.
 */
export function ImageViewer({ images, startIndex, onClose }: ImageViewerProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(startIndex);
  const image = images[index];

  const last = images.length - 1;
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // ← and → work wherever the focus is while the viewer is open.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const offset = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
      if (offset === 0) return;
      event.preventDefault();
      setIndex((current) => Math.min(last, Math.max(0, current + offset)));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [last]);

  if (image === undefined) return null;
  const number = index + 1;
  const go = (offset: -1 | 1) =>
    setIndex((current) => Math.min(last, Math.max(0, current + offset)));

  return (
    <dialog
      ref={ref}
      className="viewer"
      aria-label={t('media.view.position', { number, count: images.length })}
      onClose={onClose}
    >
      <div className="viewer__stage">
        {image.isMissing ? (
          <p className="missing-file viewer__missing">{t('media.view.missing')}</p>
        ) : (
          <img
            key={image.mediaId}
            className="viewer__image"
            src={fullImageSource(image.sha256)}
            width={image.width ?? undefined}
            height={image.height ?? undefined}
            alt={t('media.images.image', { number })}
          />
        )}
      </div>

      <button
        type="button"
        className="viewer__button viewer__close"
        aria-label={t('common.close')}
        autoFocus
        onClick={() => ref.current?.close()}
      >
        ×
      </button>
      {images.length > 1 && (
        <>
          <button
            type="button"
            className="viewer__button viewer__previous"
            aria-label={t('media.view.previous')}
            disabled={index === 0}
            onClick={() => go(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="viewer__button viewer__next"
            aria-label={t('media.view.next')}
            disabled={index === images.length - 1}
            onClick={() => go(1)}
          >
            ›
          </button>
        </>
      )}
      <p className="viewer__counter" aria-hidden="true">
        {number} / {images.length}
      </p>
    </dialog>
  );
}
