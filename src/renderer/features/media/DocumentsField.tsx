import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage, IpcError, unwrap } from '../../lib/ipc';
import { formatFileSize } from '../../lib/media-url';
import { Problems } from './ImagesField';
import { moveImage, preparedDocument, renameDocument, type FormDocument } from './media-form';

interface DocumentsFieldProps {
  token: string;
  documents: readonly FormDocument[];
  onChange: (documents: readonly FormDocument[]) => void;
}

/**
 * The item's PDF documents in the edit form, each with a name the user can change. They are
 * kept as they are, without an import window, and saved in this order with the item.
 */
export function DocumentsField({ token, documents, onChange }: DocumentsFieldProps) {
  const { t, i18n } = useTranslation();
  const [preparing, setPreparing] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  async function pick() {
    setPreparing(true);
    setProblems([]);
    try {
      const picked = unwrap(
        await window.api.media.pickDocuments({ token, filterName: t('media.documents.fileType') }),
      );
      if (picked === null) return;
      setProblems(
        picked.rejected.map(({ fileName, code }) =>
          t('media.images.rejected', {
            name: fileName,
            reason: errorMessage(t, new IpcError(code, code)),
          }),
        ),
      );
      onChange([...documents, ...picked.prepared.map(preparedDocument)]);
    } catch (caught) {
      setProblems([errorMessage(t, caught)]);
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div className="documents-field">
      {documents.length > 0 && (
        <ol className="document-list">
          {documents.map((document, index) => {
            const number = index + 1;
            const byteSize =
              document.source === 'existing' ? document.media.byteSize : document.prepared.byteSize;
            return (
              <li key={document.key} className="document-list__item">
                <input
                  type="text"
                  className="document-list__name"
                  aria-label={t('media.documents.name', { number })}
                  aria-invalid={document.label.trim() === ''}
                  value={document.label}
                  onChange={(event) =>
                    onChange(renameDocument(documents, index, event.target.value))
                  }
                />
                <span className="muted">{formatFileSize(byteSize, i18n.language)}</span>
                {document.source === 'prepared' && (
                  <span className="badge">{t('media.documents.new')}</span>
                )}
                {document.source === 'existing' && document.media.isMissing && (
                  <span className="badge">{t('media.view.missing')}</span>
                )}
                <span className="document-list__actions">
                  <button
                    type="button"
                    className="chip__button"
                    aria-label={t('media.documents.moveUp', { number })}
                    disabled={index === 0}
                    onClick={() => onChange(moveImage(documents, index, -1))}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="chip__button"
                    aria-label={t('media.documents.moveDown', { number })}
                    disabled={index === documents.length - 1}
                    onClick={() => onChange(moveImage(documents, index, 1))}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="link-button link-button--danger"
                    aria-label={t('media.documents.removeLabel', { number })}
                    onClick={() => onChange(documents.filter((_, i) => i !== index))}
                  >
                    {t('media.documents.remove')}
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <div>
        <button
          type="button"
          className="button button--ghost"
          disabled={preparing}
          onClick={() => void pick()}
        >
          {t('media.documents.add')}
        </button>
        {preparing && (
          <span className="muted" role="status">
            {' '}
            {t('media.documents.preparing')}
          </span>
        )}
      </div>
      <Problems problems={problems} />
    </div>
  );
}
