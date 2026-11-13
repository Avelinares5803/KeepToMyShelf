import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Profile } from '../../../shared/ipc';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { unwrap } from '../../lib/ipc';
import { BackupProgressDialog, useBackupProgress } from '../backups/BackupProgressDialog';

interface DeleteProfileDialogProps {
  profile: Profile;
  onDeleted: () => void;
  onClose: () => void;
}

/**
 * Deleting a profile erases all its data, so the profile is shown prominently. A backup of it
 * is saved first, with its progress shown over this dialog.
 */
export function DeleteProfileDialog({ profile, onDeleted, onClose }: DeleteProfileDialogProps) {
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState(false);
  const progress = useBackupProgress(deleting);

  return (
    <>
      <ConfirmDialog
        title={t('profiles.deleteDialog.title')}
        confirmLabel={t('profiles.deleteDialog.confirm')}
        danger
        onClose={onClose}
        onConfirm={async () => {
          setDeleting(true);
          try {
            unwrap(await window.api.profiles.delete({ profileId: profile.id }));
          } finally {
            setDeleting(false);
          }
          onDeleted();
        }}
      >
        <p>{t('profiles.deleteDialog.question')}</p>
        <strong className="profile-to-delete">{profile.name}</strong>
        <p className="muted">
          {t('profiles.deleteDialog.warning')} {t('profiles.deleteDialog.backupNotice')}
        </p>
      </ConfirmDialog>
      {progress !== null && (
        <BackupProgressDialog
          title={t('profiles.deleteDialog.deletingTitle')}
          message={t('profiles.deleteDialog.savingBackup')}
          progress={progress}
        />
      )}
    </>
  );
}
