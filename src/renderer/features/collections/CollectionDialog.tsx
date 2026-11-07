import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { CollectionDetails } from '../../../shared/collections';
import { Dialog } from '../../components/Dialog';
import { errorMessage, unwrap } from '../../lib/ipc';
import { CoverField } from '../media/CoverField';
import {
  coverChanged,
  fromAttachment,
  preparedIds,
  toCoverPlan,
  type FormImage,
} from '../media/media-form';
import type { ImageImportOptions } from '../media/use-image-import';

interface CollectionDialogProps {
  token: string;
  /** Null to create a new collection. */
  collection: CollectionDetails | null;
  imageImport: ImageImportOptions;
  onSaved: (collection: CollectionDetails) => void;
  onClose: () => void;
}

/**
 * Creates a collection or changes its name and cover. A chosen cover is only prepared: it is
 * saved with the collection, and dropped if the window is closed without saving.
 */
export function CollectionDialog({
  token,
  collection,
  imageImport,
  onSaved,
  onClose,
}: CollectionDialogProps) {
  const { t } = useTranslation();
  const id = useId();
  const savedCover = collection?.cover ? fromAttachment(collection.cover) : null;
  const [name, setName] = useState(collection?.name ?? '');
  const [cover, setCover] = useState<FormImage | null>(savedCover);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  // Only frees temporary files early: they are also dropped when the profile closes.
  const discard = (ids: string[]) => {
    if (ids.length > 0) void window.api.media.discardImports({ token, preparedIds: ids });
  };

  function changeCover(next: FormImage | null) {
    const kept = preparedIds(next, []);
    discard(preparedIds(cover, []).filter((preparedId) => !kept.includes(preparedId)));
    setCover(next);
  }

  // Closing the window drops the import that was not saved (a saved one is already used up).
  const latestCover = useRef(cover);
  useEffect(() => {
    latestCover.current = cover;
  });
  useEffect(
    () => () => {
      const ids = preparedIds(latestCover.current, []);
      if (ids.length > 0) void window.api.media.discardImports({ token, preparedIds: ids });
    },
    [token],
  );

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    // The cover is sent only when it changed; left out, it stays as it is.
    const plan = coverChanged(savedCover, cover) ? { cover: toCoverPlan(cover) } : {};
    try {
      const saved = unwrap(
        collection
          ? await window.api.collections.update({ token, id: collection.id, name, ...plan })
          : await window.api.collections.create({ token, name, ...plan }),
      );
      onSaved(saved);
    } catch (caught) {
      setError(caught);
      setBusy(false);
    }
  }

  const formId = `${id}-form`;
  return (
    <Dialog
      open
      title={
        collection ? t('collections.editDialog', { name: collection.name }) : t('collections.new')
      }
      onClose={onClose}
    >
      <div className="form collection-form">
        {/* The cover stays outside the form: Enter in its import window never saves. */}
        <form id={formId} onSubmit={(event) => void submit(event)}>
          <div className="field">
            <label htmlFor={`${id}-name`}>{t('collections.fields.name')}</label>
            <input
              id={`${id}-name`}
              type="text"
              value={name}
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </div>
        </form>

        <fieldset className="fieldset">
          <legend>{t('collections.fields.cover')}</legend>
          <CoverField
            token={token}
            cover={cover}
            onChange={changeCover}
            importChoice={imageImport.importChoice}
            optimizedMaxSide={imageImport.optimizedMaxSide}
            onRememberChoice={imageImport.onRememberChoice}
          />
        </fieldset>

        {error !== null && (
          <p className="field__error" role="alert">
            {errorMessage(t, error)}
          </p>
        )}
        <div className="form__actions">
          <button type="button" className="button button--ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" form={formId} className="button button--primary" disabled={busy}>
            {t('common.save')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
