import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../lib/ipc';
import { Dialog } from './Dialog';

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  /** Destructive actions get a red button. */
  danger?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/**
 * Asks before an action. Focus starts on "Cancel", so pressing Enter without reading never
 * confirms; errors from the action are shown inside the dialog.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (caught) {
      setError(caught);
      setBusy(false);
    }
  }

  return (
    <Dialog open title={title} onClose={onClose}>
      <div className="form">
        {children}
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
            className={`button ${danger ? 'button--danger' : 'button--primary'}`}
            disabled={busy}
            onClick={() => void confirm()}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
