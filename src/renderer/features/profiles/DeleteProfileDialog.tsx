import { useTranslation } from 'react-i18next';
import type { Profile } from '../../../shared/ipc';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { unwrap } from '../../lib/ipc';

interface DeleteProfileDialogProps {
  profile: Profile;
  onDeleted: () => void;
  onClose: () => void;
}

/** Deleting a profile erases all its data, so the profile is shown prominently. */
export function DeleteProfileDialog({ profile, onDeleted, onClose }: DeleteProfileDialogProps) {
  const { t } = useTranslation();

  return (
    <ConfirmDialog
      title={t('profiles.deleteDialog.title')}
      confirmLabel={t('profiles.deleteDialog.confirm')}
      danger
      onClose={onClose}
      onConfirm={async () => {
        unwrap(await window.api.profiles.delete({ profileId: profile.id }));
        onDeleted();
      }}
    >
      <p>{t('profiles.deleteDialog.question')}</p>
      <strong className="profile-to-delete">{profile.name}</strong>
      <p className="muted">{t('profiles.deleteDialog.warning')}</p>
    </ConfirmDialog>
  );
}
