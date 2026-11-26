import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImportCounts, ImportPreview } from '../../../shared/imports';
import { errorMessage, unwrap } from '../../lib/ipc';
import { BackupProgressDialog, useBackupProgress } from '../backups/BackupProgressDialog';
import { ImportConfirmDialog } from './ImportConfirmDialog';
import { addsAnything, ImportCountsList } from './ImportCounts';

export interface ImportSettingsProps {
  /** The open profile, which receives the import. */
  token: string;
  profileName: string;
  /** Runs `start` once the item editor (if open) has no unsaved changes, asking if it has. */
  beforeImport: (start: () => void) => void;
  /** Something was imported: what the screens show may have changed. */
  onImported: () => void;
}

type Outcome =
  | { readonly kind: 'message'; readonly text: string }
  | { readonly kind: 'problem'; readonly text: string }
  | { readonly kind: 'imported'; readonly fileName: string; readonly counts: ImportCounts };

/** The "Import" section of the settings dialog; only shown with a profile open. */
export function ImportSettings({
  token,
  profileName,
  beforeImport,
  onImported,
}: ImportSettingsProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<unknown>(null);
  const progress = useBackupProgress(running);

  async function chooseFile() {
    setOutcome(null);
    setError(null);
    try {
      // The main process opens the file dialog, reads the file and checks it; nothing is
      // imported until the user confirms.
      const check = unwrap(
        await window.api.imports.preview({ token, filterName: t('imports.fileType') }),
      );
      if (check === null) return;
      if (!check.valid) {
        const { position, title, code } = check.item;
        setOutcome({
          kind: 'problem',
          text: t('imports.invalidItem', {
            position,
            fileName: check.fileName,
            title: title ?? t('imports.untitled'),
            reason: t(`errors.${code}`, { defaultValue: t('errors.unknown') }),
          }),
        });
      } else if (!addsAnything(check.preview.counts)) {
        setOutcome({
          kind: 'message',
          text: t('imports.nothingNew', { fileName: check.preview.fileName }),
        });
      } else {
        setPreview(check.preview);
      }
    } catch (caught) {
      setError(caught);
    }
  }

  async function confirm(chosen: ImportPreview) {
    setPreview(null);
    setRunning(true);
    try {
      const counts = unwrap(await window.api.imports.confirm({ token, importId: chosen.importId }));
      setOutcome({ kind: 'imported', fileName: chosen.fileName, counts });
      onImported();
    } catch (caught) {
      setError(caught);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="settings-section" aria-labelledby={headingId}>
      <h3 id={headingId} className="settings-section__title">
        {t('imports.title')}
      </h3>
      <p className="muted field__hint">{t('imports.hint')}</p>
      <div className="setting-row">
        <button
          type="button"
          className="button button--ghost"
          disabled={running}
          onClick={() => beforeImport(() => void chooseFile())}
        >
          {t('imports.open')}
        </button>
      </div>
      {outcome?.kind === 'problem' && (
        <p className="field__error" role="alert">
          {outcome.text}
        </p>
      )}
      {outcome?.kind === 'message' && (
        <p className="field__hint" role="status">
          {outcome.text}
        </p>
      )}
      {outcome?.kind === 'imported' && (
        <div role="status">
          <p className="field__hint">{t('imports.done', { fileName: outcome.fileName })}</p>
          <ImportCountsList counts={outcome.counts} />
        </div>
      )}
      {error !== null && (
        <p className="field__error" role="alert">
          {errorMessage(t, error)}
        </p>
      )}

      {preview !== null && (
        <ImportConfirmDialog
          preview={preview}
          profileName={profileName}
          onConfirm={() => void confirm(preview)}
          onClose={() => setPreview(null)}
        />
      )}
      {progress !== null && running && (
        <BackupProgressDialog
          title={t('imports.importingTitle')}
          message={t('imports.importing')}
          progress={progress}
        />
      )}
    </section>
  );
}
