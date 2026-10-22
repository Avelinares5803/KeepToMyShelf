import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Profile } from '../../../shared/ipc';
import { Dialog } from '../../components/Dialog';
import { errorMessage, unwrap } from '../../lib/ipc';

interface DeleteProfileDialogProps {
  profile: Profile;
  onDeleted: () => void;
  onClose: () => void;
}

/**
 * Deleting a profile erases all its data. The profile is shown prominently and focus starts
 * on "Cancel", so pressing Enter without reading never deletes anything.
 */
export function DeleteProfileDialog({ profile, onDeleted, onClose }: DeleteProfileDialogProps) {
  const { t } = useTranslation();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function confirmDelete() {
    setBusy(true);
    setError(null);
    try {
      unwrap(await window.api.profiles.delete({ profileId: profile.id }));
      onDeleted();
    } catch (caught) {
      setError(caught);
      setBusy(false);
    }
  }

  return (
    <Dialog open title={t('profiles.deleteDialog.title')} onClose={onClose}>
      <div className="form">
        <p>{t('profiles.deleteDialog.question')}</p>
        <strong className="profile-to-delete">{profile.name}</strong>
        <p className="muted">{t('profiles.deleteDialog.warning')}</p>
        {error !== null && (
          <p className="field__error" role="alert">
            {errorMessage(t, error)}
          </p>
        )}
        <div className="form__actions">
          <button type="button" className="button button--ghost" autoFocus onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="button button--danger"
            disabled={busy}
            onClick={() => void confirmDelete()}
          >
            {t('profiles.deleteDialog.confirm')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
