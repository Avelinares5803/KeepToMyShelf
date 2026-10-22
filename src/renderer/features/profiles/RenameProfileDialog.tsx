import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Profile, ProfileChange } from '../../../shared/ipc';
import { Dialog } from '../../components/Dialog';
import { errorMessage, unwrap } from '../../lib/ipc';
import { NameField } from './NameField';

interface RenameProfileDialogProps {
  profile: Profile;
  onRenamed: (change: ProfileChange) => void;
  onClose: () => void;
}

export function RenameProfileDialog({ profile, onRenamed, onClose }: RenameProfileDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(profile.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onRenamed(unwrap(await window.api.profiles.rename({ profileId: profile.id, name })));
    } catch (caught) {
      setError(errorMessage(t, caught));
      setBusy(false);
    }
  }

  return (
    <Dialog open title={t('profiles.renameDialog.title')} onClose={onClose}>
      <form className="form" onSubmit={(event) => void submit(event)}>
        <NameField label={t('profiles.form.name')} value={name} error={error} onChange={setName} />
        <div className="form__actions">
          <button type="button" className="button button--ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="button button--primary" disabled={busy}>
            {t('common.save')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
