import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BackupProgress } from '../../../shared/backups';

/**
 * How far the backup being written has got, while `active`; null until the main process
 * reports that it has started (e.g. while the "Save as" dialog is still open).
 */
export function useBackupProgress(active: boolean): BackupProgress | null {
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  useEffect(() => {
    if (!active) return;
    // The main process reports the progress on its own; listening stops when it is over.
    const stop = window.api.backups.onProgress(setProgress);
    return () => {
      stop();
      setProgress(null);
    };
  }, [active]);
  return progress;
}

interface BackupProgressDialogProps {
  title: string;
  message: string;
  progress: BackupProgress;
}

/**
 * Shown while a backup is written, with how far it has got. It cannot be closed: it goes away
 * when the operation that opened it ends, and meanwhile it keeps the rest of the app out of
 * reach (a modal <dialog> makes everything behind it inert).
 */
export function BackupProgressDialog({ title, message, progress }: BackupProgressDialogProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const percent =
    progress.totalBytes === 0 ? 100 : Math.floor((progress.doneBytes * 100) / progress.totalBytes);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      // Escape asks the dialog to close: refused. Chromium lets a page refuse it only once
      // without a click in between, so if it closes anyway it is shown again (unless it is
      // closing because it was removed from the page).
      onCancel={(event) => event.preventDefault()}
      onClose={(event) => {
        const dialog = event.currentTarget;
        if (event.target === dialog && dialog.isConnected) dialog.showModal();
      }}
    >
      <h2 id={titleId} className="dialog__title">
        {title}
      </h2>
      <div className="form">
        <p>{message}</p>
        <div className="backup-progress">
          <progress
            className="backup-progress__bar"
            max={100}
            value={percent}
            aria-labelledby={titleId}
          />
          <span className="backup-progress__value" aria-hidden="true">
            {t('backups.percent', { percent })}
          </span>
        </div>
      </div>
    </dialog>
  );
}
