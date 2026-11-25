import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CSV_SEPARATORS, type CsvSeparator } from '../../../core/export/csv';
import { ITEM_KINDS, type ItemKind } from '../../../shared/content';
import type { ExportTarget } from '../../../shared/exports';
import type { Language } from '../../../shared/settings';
import { errorMessage, unwrap } from '../../lib/ipc';

interface ExportSettingsProps {
  /** The open profile, whose library is exported. */
  token: string;
  language: Language;
}

/** What spreadsheets expect in most regions that use each language. */
const USUAL_SEPARATOR: Record<Language, CsvSeparator> = { es: ';', en: ',' };

/** The "Export" section of the settings dialog; only shown with a profile open. */
export function ExportSettings({ token, language }: ExportSettingsProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const contentId = useId();
  const separatorId = useId();
  const [content, setContent] = useState<'library' | ItemKind>('library');
  // Until one is chosen, it follows the language.
  const [chosenSeparator, setChosenSeparator] = useState<CsvSeparator | null>(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const separator = chosenSeparator ?? USUAL_SEPARATOR[language];

  async function run() {
    setStatus(null);
    setError(null);
    setRunning(true);
    try {
      const target: ExportTarget =
        content === 'library' ? { format: 'json' } : { format: 'csv', kind: content, separator };
      // The main process opens the "Save as" dialog: the UI never sees the path.
      const saved = unwrap(
        await window.api.exports.save({
          token,
          target,
          filterName: t(`exports.fileType.${target.format}`),
        }),
      );
      if (saved !== null) {
        setStatus(t('exports.saved', { fileName: saved.fileName, count: saved.items }));
      }
    } catch (caught) {
      setError(caught);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="settings-section" aria-labelledby={headingId}>
      <h3 id={headingId} className="settings-section__title">
        {t('exports.title')}
      </h3>
      <p className="muted field__hint">{t('exports.hint')}</p>
      <div className="setting-row">
        <div className="field">
          <label htmlFor={contentId}>{t('exports.content.label')}</label>
          <select
            id={contentId}
            aria-describedby={`${contentId}-hint`}
            value={content}
            onChange={(event) => setContent(event.target.value as 'library' | ItemKind)}
          >
            <option value="library">{t('exports.content.library')}</option>
            {ITEM_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(`exports.content.${kind}`)}
              </option>
            ))}
          </select>
        </div>
        {content !== 'library' && (
          <div className="field">
            <label htmlFor={separatorId}>{t('exports.separator.label')}</label>
            <select
              id={separatorId}
              value={separator}
              onChange={(event) => setChosenSeparator(event.target.value as CsvSeparator)}
            >
              {CSV_SEPARATORS.map((option) => (
                <option key={option} value={option}>
                  {t(`exports.separator.${option === ';' ? 'semicolon' : 'comma'}`)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <p id={`${contentId}-hint`} className="muted field__hint setting-row__hint">
        {t(content === 'library' ? 'exports.jsonHint' : 'exports.csvHint')}
      </p>
      <div className="setting-row">
        <button
          type="button"
          className="button button--ghost"
          disabled={running}
          onClick={() => void run()}
        >
          {t('exports.save')}
        </button>
      </div>
      {status !== null && (
        <p className="field__hint" role="status">
          {status}
        </p>
      )}
      {error !== null && (
        <p className="field__error" role="alert">
          {errorMessage(t, error)}
        </p>
      )}
    </section>
  );
}
