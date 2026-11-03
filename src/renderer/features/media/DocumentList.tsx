import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MediaAttachment } from '../../../shared/media';
import { errorMessage, unwrap } from '../../lib/ipc';
import { formatFileSize } from '../../lib/media-url';

interface DocumentListProps {
  token: string;
  itemId: number;
  documents: readonly MediaAttachment[];
}

/** The item's documents in the detail view: each one opens in the system's PDF viewer. */
export function DocumentList({ token, itemId, documents }: DocumentListProps) {
  const { t, i18n } = useTranslation();
  const [opening, setOpening] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function open(document: MediaAttachment) {
    setOpening(document.mediaId);
    setError(null);
    try {
      unwrap(await window.api.media.openDocument({ token, itemId, mediaId: document.mediaId }));
    } catch (caught) {
      setError(caught);
    } finally {
      setOpening(null);
    }
  }

  return (
    <>
      <ul className="document-links plain-list">
        {documents.map((document) => {
          const name = document.label ?? '';
          const size = formatFileSize(document.byteSize, i18n.language);
          return (
            <li key={document.mediaId}>
              {document.isMissing ? (
                <span className="muted">
                  {name} · {t('media.view.missing')}
                </span>
              ) : (
                <button
                  type="button"
                  className="link-button document-links__open"
                  aria-label={t('media.documents.open', { name })}
                  disabled={opening !== null}
                  onClick={() => void open(document)}
                >
                  {name}
                </button>
              )}{' '}
              <span className="muted">
                {opening === document.mediaId ? t('media.documents.opening') : size}
              </span>
            </li>
          );
        })}
      </ul>
      {error !== null && (
        <p className="banner banner--error" role="alert">
          {errorMessage(t, error)}
        </p>
      )}
    </>
  );
}
