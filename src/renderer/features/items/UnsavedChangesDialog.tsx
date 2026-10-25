import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../../components/Dialog';

interface UnsavedChangesDialogProps {
  onKeepEditing: () => void;
  onDiscard: () => void;
  /** Resolves to false if saving failed; the editor then shows the error and stays open. */
  onSave: () => Promise<boolean>;
}

/** Asked when leaving the editor with changes made since the last save. */
export function UnsavedChangesDialog({
  onKeepEditing,
  onDiscard,
  onSave,
}: UnsavedChangesDialogProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    if (!(await onSave())) {
      setBusy(false);
      onKeepEditing();
    }
  }

  return (
    <Dialog open title={t('unsaved.title')} onClose={onKeepEditing}>
      <div className="form">
        <p>{t('unsaved.message')}</p>
        <div className="form__actions">
          <button type="button" className="button button--ghost" autoFocus onClick={onKeepEditing}>
            {t('unsaved.keepEditing')}
          </button>
          <button type="button" className="button button--danger" onClick={onDiscard}>
            {t('unsaved.discard')}
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={busy}
            onClick={() => void save()}
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
