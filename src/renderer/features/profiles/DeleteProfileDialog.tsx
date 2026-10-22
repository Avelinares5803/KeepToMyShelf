import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Profile } from '../../../shared/ipc';
import { Dialog } from '../../components/Dialog';
import { errorMessage, unwrap } from '../../lib/ipc';

interface DeleteProfileDialogProps {
  profile: Profile;
  onDeleted: () => void;
  onClose: () => void;
}

/** Deleting a profile erases all its data, so the user must type its exact name. */
export function DeleteProfileDialog({ profile, onDeleted, onClose }: DeleteProfileDialogProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmed = confirmation.trim() === profile.name;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      unwrap(await window.api.profiles.delete({ profileId: profile.id }));
      onDeleted();
    } catch (caught) {
      setError(errorMessage(t, caught));
      setBusy(false);
    }
  }

  return (
    <Dialog open title={t('profiles.deleteDialog.title')} onClose={onClose}>
      <form className="form" onSubmit={(event) => void submit(event)}>
        <p>{t('profiles.deleteDialog.warning', { name: profile.name })}</p>
        <div className="field">
          <label htmlFor={inputId}>
            {t('profiles.deleteDialog.confirmLabel', { name: profile.name })}
          </label>
          <input
            id={inputId}
            type="text"
            value={confirmation}
            autoFocus
            autoComplete="off"
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </div>
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
        <div className="form__actions">
          <button type="button" className="button button--ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="button button--danger" disabled={!confirmed || busy}>
            {t('profiles.deleteDialog.confirm')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
