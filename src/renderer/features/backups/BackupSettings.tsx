import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BackupSaved } from '../../../shared/backups';
import { errorMessage, unwrap } from '../../lib/ipc';
import { BackupProgressDialog, useBackupProgress } from './BackupProgressDialog';

interface BackupSettingsProps {
  /** The open profile, whose backup is made. */
  token: string;
}

/** The "Backups" section of the settings dialog; only shown with a profile open. */
export function BackupSettings({ token }: BackupSettingsProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const [creating, setCreating] = useState(false);
  const [saved, setSaved] = useState<BackupSaved | null>(null);
  const [error, setError] = useState<unknown>(null);
  const progress = useBackupProgress(creating);

  async function create() {
    setSaved(null);
    setError(null);
    setCreating(true);
    try {
      // The main process opens the "Save as" dialog: the UI never sees the path.
      const result = unwrap(
        await window.api.backups.create({ token, filterName: t('backups.fileType') }),
      );
      setSaved(result);
    } catch (caught) {
      setError(caught);
    } finally {
      setCreating(false);
    }
  }

  async function openFolder() {
    setError(null);
    try {
      unwrap(await window.api.backups.openFolder());
    } catch (caught) {
      setError(caught);
    }
  }

  return (
    <section className="settings-section" aria-labelledby={headingId}>
      <h3 id={headingId} className="settings-section__title">
        {t('backups.title')}
      </h3>
      <p className="muted field__hint">{t('backups.hint')}</p>
      <div className="setting-row">
        <button
          type="button"
          className="button button--primary"
          disabled={creating}
          onClick={() => void create()}
        >
          {t('backups.create')}
        </button>
      </div>
      {saved !== null && (
        <div role="status">
          <p className="field__hint">{t('backups.saved', { fileName: saved.fileName })}</p>
          {saved.missing > 0 && (
            <p className="muted field__hint">{t('backups.missing', { count: saved.missing })}</p>
          )}
        </div>
      )}
      {error !== null && (
        <p className="field__error" role="alert">
          {errorMessage(t, error)}
        </p>
      )}

      <p className="muted field__hint">{t('backups.automaticHint')}</p>
      <div className="setting-row">
        <button type="button" className="button button--ghost" onClick={() => void openFolder()}>
          {t('backups.openFolder')}
        </button>
      </div>

      {progress !== null && (
        <BackupProgressDialog
          title={t('backups.creatingTitle')}
          message={t('backups.creating')}
          progress={progress}
        />
      )}
    </section>
  );
}
