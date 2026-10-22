import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Profile, ProfileChange } from '../../../shared/ipc';
import { Dialog } from '../../components/Dialog';
import { errorMessage, unwrap } from '../../lib/ipc';
import { CreateProfileForm } from './CreateProfileForm';
import { DeleteProfileDialog } from './DeleteProfileDialog';
import { RenameProfileDialog } from './RenameProfileDialog';

type OpenDialog =
  | { kind: 'create' }
  | { kind: 'rename'; profile: Profile }
  | { kind: 'delete'; profile: Profile }
  | null;

interface ProfileSelectionScreenProps {
  onOpen: (profileId: string) => void;
}

export function ProfileSelectionScreen({ onOpen }: ProfileSelectionScreenProps) {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [listVersion, setListVersion] = useState(0);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Reloads whenever listVersion changes; a response arriving after unmount is ignored.
  useEffect(() => {
    let active = true;
    window.api.profiles
      .list()
      .then((result) => {
        if (active) setProfiles(unwrap(result));
      })
      .catch((caught: unknown) => {
        if (active) setLoadError(caught);
      });
    return () => {
      active = false;
    };
  }, [listVersion]);

  const reload = () => setListVersion((version) => version + 1);

  function handleSaved(change: ProfileChange) {
    setDialog(null);
    setNotice(change.renamed ? t('profiles.renamedNotice', { name: change.profile.name }) : null);
    reload();
  }

  function handleDeleted() {
    setDialog(null);
    setNotice(null);
    reload();
  }

  if (loadError) {
    return (
      <p className="banner banner--error" role="alert">
        {errorMessage(t, loadError)}
      </p>
    );
  }
  if (profiles === null) return null;

  if (profiles.length === 0) {
    return (
      <section className="profiles">
        <h1>{t('profiles.firstProfile')}</h1>
        <div className="card">
          <CreateProfileForm onCreated={handleSaved} />
        </div>
      </section>
    );
  }

  return (
    <section className="profiles">
      <h1>{t('profiles.title')}</h1>
      {notice && (
        <p className="banner" role="status">
          {notice}
        </p>
      )}
      <ul className="profile-grid">
        {profiles.map((profile) => (
          <li key={profile.id} className="profile-card">
            <button
              type="button"
              className="profile-card__open"
              aria-label={t('profiles.open', { name: profile.name })}
              onClick={() => onOpen(profile.id)}
            >
              <span className="profile-card__name">{profile.name}</span>
            </button>
            <div className="profile-card__actions">
              <button
                type="button"
                className="link-button"
                aria-label={t('profiles.renameProfile', { name: profile.name })}
                onClick={() => setDialog({ kind: 'rename', profile })}
              >
                {t('profiles.rename')}
              </button>
              <button
                type="button"
                className="link-button link-button--danger"
                aria-label={t('profiles.deleteProfile', { name: profile.name })}
                onClick={() => setDialog({ kind: 'delete', profile })}
              >
                {t('profiles.delete')}
              </button>
            </div>
          </li>
        ))}
        <li className="profile-card">
          <button
            type="button"
            className="profile-card__open profile-card__open--new"
            onClick={() => setDialog({ kind: 'create' })}
          >
            <span className="profile-card__name">{t('profiles.new')}</span>
          </button>
        </li>
      </ul>

      {dialog?.kind === 'create' && (
        <Dialog open title={t('profiles.new')} onClose={() => setDialog(null)}>
          <CreateProfileForm onCreated={handleSaved} onCancel={() => setDialog(null)} />
        </Dialog>
      )}
      {dialog?.kind === 'rename' && (
        <RenameProfileDialog
          profile={dialog.profile}
          onRenamed={handleSaved}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'delete' && (
        <DeleteProfileDialog
          profile={dialog.profile}
          onDeleted={handleDeleted}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}
