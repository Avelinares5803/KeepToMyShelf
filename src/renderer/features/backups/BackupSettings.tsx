import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BackupSaved, RestorePreview } from '../../../shared/backups';
import type { SessionInfo } from '../../../shared/ipc';
import { errorMessage, IpcError, unwrap } from '../../lib/ipc';
import { BackupProgressDialog, useBackupProgress } from './BackupProgressDialog';
import { RestoreOverDialog } from './RestoreOverDialog';

/** What the section needs to restore a backup over the open profile. */
export interface RestoreOverOptions {
  /** Name of the open profile, which keeps it. */
  profileName: string;
  /** Runs `start` once the item editor (if open) has no unsaved changes, asking if it has. */
  beforeRestore: (start: () => void) => void;
  /** The profile was restored and opened again with a new session. */
  onRestored: (session: SessionInfo) => Promise<void>;
  /**
   * The restore failed and may have closed the session first (the main process opens the
   * profile again, unchanged, with a token the UI does not know): the UI opens it again.
   */
  onSessionLost: () => Promise<void>;
}

export interface BackupSettingsProps extends RestoreOverOptions {
  /** The open profile, whose backup is made. */
  token: string;
}

type Running = 'create' | 'restore' | null;

/** The "Backups" section of the settings dialog; only shown with a profile open. */
export function BackupSettings({
  token,
  profileName,
  beforeRestore,
  onRestored,
  onSessionLost,
}: BackupSettingsProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const [running, setRunning] = useState<Running>(null);
  const [status, setStatus] = useState<{ text: string; missing: number } | null>(null);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [error, setError] = useState<unknown>(null);
  const progress = useBackupProgress(running !== null);

  function startOver() {
    setStatus(null);
    setError(null);
  }

  async function create() {
    startOver();
    setRunning('create');
    try {
      // The main process opens the "Save as" dialog: the UI never sees the path.
      const saved: BackupSaved | null = unwrap(
        await window.api.backups.create({ token, filterName: t('backups.fileType') }),
      );
      if (saved !== null) {
        setStatus({
          text: t('backups.saved', { fileName: saved.fileName }),
          missing: saved.missing,
        });
      }
    } catch (caught) {
      setError(caught);
    } finally {
      setRunning(null);
    }
  }

  async function chooseBackupToRestore() {
    startOver();
    try {
      // The main process opens the file dialog and reads the backup's manifest; nothing is
      // restored until the user confirms.
      setPreview(
        unwrap(
          await window.api.backups.previewRestore({ token, filterName: t('backups.fileType') }),
        ),
      );
    } catch (caught) {
      setError(caught);
    }
  }

  async function restore(chosen: RestorePreview) {
    setPreview(null);
    setRunning('restore');
    try {
      const session = unwrap(
        await window.api.backups.restoreOver({ token, restoreId: chosen.restoreId }),
      );
      await onRestored(session);
      setStatus({ text: t('backups.restored', { fileName: chosen.fileName }), missing: 0 });
    } catch (caught) {
      setError(caught);
      // Only this error can come after the session was closed.
      if (caught instanceof IpcError && caught.code === 'backup.restore_failed') {
        await onSessionLost().catch(setError);
      }
    } finally {
      setRunning(null);
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
          disabled={running !== null}
          onClick={() => void create()}
        >
          {t('backups.create')}
        </button>
        <button
          type="button"
          className="button button--ghost"
          disabled={running !== null}
          onClick={() => beforeRestore(() => void chooseBackupToRestore())}
        >
          {t('backups.restoreOver.open')}
        </button>
      </div>
      {status !== null && (
        <div role="status">
          <p className="field__hint">{status.text}</p>
          {status.missing > 0 && (
            <p className="muted field__hint">{t('backups.missing', { count: status.missing })}</p>
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

      {preview !== null && (
        <RestoreOverDialog
          preview={preview}
          profileName={profileName}
          onConfirm={() => void restore(preview)}
          onClose={() => setPreview(null)}
        />
      )}
      {progress !== null && running === 'create' && (
        <BackupProgressDialog
          title={t('backups.creatingTitle')}
          message={t('backups.creating')}
          progress={progress}
        />
      )}
      {progress !== null && running === 'restore' && (
        <BackupProgressDialog
          title={t('backups.restoringTitle')}
          // Restoring over the profile first checks the backup, then saves the current state.
          message={t(
            progress.stage === 'restore'
              ? 'backups.restoreOver.stepRestore'
              : 'backups.restoreOver.stepBackup',
          )}
          progress={progress}
        />
      )}
    </section>
  );
}
