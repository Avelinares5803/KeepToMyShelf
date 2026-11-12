import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImportedBackground } from '../../../shared/backgrounds';
import type { Profile, ProfileChange } from '../../../shared/ipc';
import type { BackgroundChoice } from '../../../shared/settings';
import { Dialog } from '../../components/Dialog';
import { errorMessage, unwrap } from '../../lib/ipc';
import { backgroundPreview } from '../backgrounds/presets';
import { CreateProfileForm, type ProfileBackgrounds } from './CreateProfileForm';
import { DeleteProfileDialog } from './DeleteProfileDialog';
import { RenameProfileDialog } from './RenameProfileDialog';

/**
 * Opens a profile. Its background fills the card, with the name over a dark gradient so it
 * reads on any picture; a profile without one (or whose picture cannot load) has a plain card.
 */
function OpenProfileButton({
  profile,
  globalBackground,
  gallery,
  onOpen,
}: {
  profile: Profile;
  /** Shown by the profiles without a background of their own. */
  globalBackground: BackgroundChoice;
  gallery: readonly ImportedBackground[];
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState<string | null>(null);
  const found = backgroundPreview(profile.ownBackground ?? globalBackground, gallery);
  const preview = found !== null && found.src !== failed ? found : null;

  return (
    <button
      type="button"
      className={`profile-card__open${preview ? ' profile-card__open--image' : ''}`}
      aria-label={t('profiles.open', { name: profile.name })}
      onClick={onOpen}
    >
      {preview && (
        <img
          className="profile-card__image"
          src={preview.src}
          srcSet={preview.srcSet}
          alt=""
          onError={() => setFailed(preview.src)}
        />
      )}
      <span className="profile-card__name">{profile.name}</span>
    </button>
  );
}

type OpenDialog =
  | { kind: 'create' }
  | { kind: 'rename'; profile: Profile }
  | { kind: 'delete'; profile: Profile }
  | null;

interface ProfileSelectionScreenProps {
  backgrounds: ProfileBackgrounds;
  onOpen: (profileId: string) => void;
}

export function ProfileSelectionScreen({ backgrounds, onOpen }: ProfileSelectionScreenProps) {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [listVersion, setListVersion] = useState(0);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // A deleted background sends the profiles that had it as their own back to none: when the
  // gallery changes, their own backgrounds are read again. (The global one is known here.)
  const galleryKey = backgrounds.gallery?.map((background) => background.id).join(',');

  // Reloads whenever listVersion or the gallery change; a response arriving after unmount is
  // ignored.
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
  }, [listVersion, galleryKey]);

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
          <CreateProfileForm backgrounds={backgrounds} onCreated={handleSaved} />
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
            <OpenProfileButton
              profile={profile}
              globalBackground={backgrounds.globalBackground}
              gallery={backgrounds.gallery ?? []}
              onOpen={() => onOpen(profile.id)}
            />
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
        // The background picker needs more room than the other profile dialogs.
        <Dialog
          open
          title={t('profiles.new')}
          className="dialog--wide"
          onClose={() => setDialog(null)}
        >
          <CreateProfileForm
            backgrounds={backgrounds}
            onCreated={handleSaved}
            onCancel={() => setDialog(null)}
          />
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
