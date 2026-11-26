import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CsvImportPreview } from '../../../shared/imports';
import { ConfirmDialog } from '../../components/ConfirmDialog';

interface CsvDuplicatesDialogProps {
  preview: CsvImportPreview;
  /** Goes on with the rows to leave out; a rejection is shown in the dialog. */
  onContinue: (skipRows: number[]) => Promise<void>;
  onClose: () => void;
}

/**
 * Lists the rows of a CSV file whose title is that of an item of the profile, each marked to be
 * left out. The titles may differ in case or accents, so both are shown: the user unmarks the
 * rows that are other items. Focus starts on "Cancel" (see ConfirmDialog).
 */
export function CsvDuplicatesDialog({ preview, onContinue, onClose }: CsvDuplicatesDialogProps) {
  const { t } = useTranslation();
  const { duplicates } = preview;
  const [skipped, setSkipped] = useState<ReadonlySet<number>>(
    () => new Set(duplicates.map(({ row }) => row)),
  );

  function toggle(row: number) {
    setSkipped((current) => {
      const next = new Set(current);
      if (next.has(row)) next.delete(row);
      else next.add(row);
      return next;
    });
  }

  const setAll = (skip: boolean) =>
    setSkipped(new Set(skip ? duplicates.map(({ row }) => row) : []));

  return (
    <ConfirmDialog
      title={t('imports.duplicates.title')}
      confirmLabel={t('imports.duplicates.continue')}
      onClose={onClose}
      onConfirm={() =>
        onContinue(duplicates.filter(({ row }) => skipped.has(row)).map(({ row }) => row))
      }
    >
      <p>
        {t('imports.duplicates.intro', { count: duplicates.length, fileName: preview.fileName })}
      </p>
      <div className="setting-row">
        <button type="button" className="button button--ghost" onClick={() => setAll(true)}>
          {t('imports.duplicates.skipAll')}
        </button>
        <button type="button" className="button button--ghost" onClick={() => setAll(false)}>
          {t('imports.duplicates.importAll')}
        </button>
      </div>
      <ul className="membership__list" aria-label={t('imports.duplicates.list')}>
        {duplicates.map(({ row, title, existingTitle }) => (
          <li key={row}>
            <label className="membership__option">
              <input type="checkbox" checked={skipped.has(row)} onChange={() => toggle(row)} />
              <span>
                {t(
                  title === existingTitle
                    ? 'imports.duplicates.sameTitle'
                    : 'imports.duplicates.similarTitle',
                  { row, title, existingTitle },
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <p className="muted">
        {t('imports.duplicates.summary', {
          skipped: skipped.size,
          imported: preview.rows - skipped.size,
        })}
      </p>
    </ConfirmDialog>
  );
}
