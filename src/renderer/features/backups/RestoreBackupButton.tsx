import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProfileChange } from '../../../shared/ipc';
import { unwrap } from '../../lib/ipc';
import { BackupProgressDialog, useBackupProgress } from './BackupProgressDialog';

interface RestoreBackupButtonProps {
  /** Called before starting, so a previous notice or error goes away. */
  onStart: () => void;
  onRestored: (change: ProfileChange) => void;
  onError: (error: unknown) => void;
}

/**
 * Restores a backup as a new profile, from the profile selection. Nothing is replaced, so it
 * asks nothing: the main process opens the file dialog and the progress is shown meanwhile.
 */
export function RestoreBackupButton({ onStart, onRestored, onError }: RestoreBackupButtonProps) {
  const { t } = useTranslation();
  const [restoring, setRestoring] = useState(false);
  const progress = useBackupProgress(restoring);

  async function restore() {
    onStart();
    setRestoring(true);
    try {
      const change = unwrap(
        await window.api.backups.restoreAsNew({ filterName: t('backups.fileType') }),
      );
      if (change !== null) onRestored(change);
    } catch (caught) {
      onError(caught);
    } finally {
      setRestoring(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="button button--ghost"
        disabled={restoring}
        onClick={() => void restore()}
      >
        {t('backups.restoreAsNew.open')}
      </button>
      {progress !== null && (
        <BackupProgressDialog
          title={t('backups.restoringTitle')}
          message={t('backups.restoreAsNew.restoring')}
          progress={progress}
        />
      )}
    </>
  );
}
