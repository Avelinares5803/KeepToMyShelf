import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BACKUP_SCHEDULES, type BackupSchedule } from '../../../core/backups/backup-schedule';
import type { BackupSaved, RestorePreview } from '../../../shared/backups';
import type { IpcResult, SessionInfo } from '../../../shared/ipc';
import type { Language, SettingUpdate } from '../../../shared/settings';
import { errorMessage, IpcError, unwrap } from '../../lib/ipc';
import { useLoad } from '../../lib/use-load';
import { BackupProgressDialog, useBackupProgress } from './BackupProgressDialog';
import { formatMoment } from './format-moment';
import { RestoreOverDialog } from './RestoreOverDialog';

/** What the section needs to restore a backup over the open profile. */
export interface RestoreOverOptions {
  /** Name of the open profile, which keeps it. */
  profileName: string;
  /** Runs `start` once the item editor (if open) has no unsaved changes, asking if it has. */
  beforeRestore: (start: () => void) => void;
  /** The profile was restored and opened again with a new session. */
  onRestored: (session: SessionInfo) => Promise<void>;
  /**
   * The restore failed and may have closed the session first (the main process opens the
   * profile again, unchanged, with a token the UI does not know): the UI opens it again.
   */
  onSessionLost: () => Promise<void>;
}

export interface BackupSettingsProps extends RestoreOverOptions {
  /** The open profile, whose backup is made. */
  token: string;
}

interface ScheduleProps {
  schedule: BackupSchedule;
  onChange: (update: SettingUpdate) => void;
  onApplyToAll: (update: SettingUpdate) => void;
}

type Running = 'create' | 'restore' | null;

/** The "Backups" section of the settings dialog; only shown with a profile open. */
export function BackupSettings({
  token,
  profileName,
  beforeRestore,
  onRestored,
  onSessionLost,
  schedule,
  onChange,
  onApplyToAll,
}: BackupSettingsProps & ScheduleProps) {
  const { t, i18n } = useTranslation();
  const headingId = useId();
  const scheduleId = useId();
  const scheduled = useLoad(() => window.api.backups.getScheduled({ token }), [token]);
  const [running, setRunning] = useState<Running>(null);
  const [status, setStatus] = useState<{ text: string; missing: number } | null>(null);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [error, setError] = useState<unknown>(null);
  const progress = useBackupProgress(running !== null);

  function startOver() {
    setStatus(null);
    setError(null);
  }

  async function create() {
    startOver();
    setRunning('create');
    try {
      // The main process opens the "Save as" dialog: the UI never sees the path.
      const saved: BackupSaved | null = unwrap(
        await window.api.backups.create({ token, filterName: t('backups.fileType') }),
      );
      if (saved !== null) {
        setStatus({
          text: t('backups.saved', { fileName: saved.fileName }),
          missing: saved.missing,
        });
      }
    } catch (caught) {
      setError(caught);
    } finally {
      setRunning(null);
    }
  }

  async function chooseBackupToRestore() {
    startOver();
    try {
      // The main process opens the file dialog and reads the backup's manifest; nothing is
      // restored until the user confirms.
      setPreview(
        unwrap(
          await window.api.backups.previewRestore({ token, filterName: t('backups.fileType') }),
        ),
      );
    } catch (caught) {
      setError(caught);
    }
  }

  async function restore(chosen: RestorePreview) {
    setPreview(null);
    setRunning('restore');
    try {
      const session = unwrap(
        await window.api.backups.restoreOver({ token, restoreId: chosen.restoreId }),
      );
      await onRestored(session);
      setStatus({ text: t('backups.restored', { fileName: chosen.fileName }), missing: 0 });
    } catch (caught) {
      setError(caught);
      // Only this error can come after the session was closed.
      if (caught instanceof IpcError && caught.code === 'backup.restore_failed') {
        await onSessionLost().catch(setError);
      }
    } finally {
      setRunning(null);
    }
  }

  async function openFolder(open: () => Promise<IpcResult<void>>) {
    setError(null);
    try {
      unwrap(await open());
    } catch (caught) {
      setError(caught);
    }
  }

  return (
    <section className="settings-section" aria-labelledby={headingId}>
      <h3 id={headingId} className="settings-section__title">
        {t('backups.title')}
      </h3>
      <p className="muted field__hint">{t('backups.hint')}</p>
      <div className="setting-row">
        <button
          type="button"
          className="button button--primary"
          disabled={running !== null}
          onClick={() => void create()}
        >
          {t('backups.create')}
        </button>
        <button
          type="button"
          className="button button--ghost"
          disabled={running !== null}
          onClick={() => beforeRestore(() => void chooseBackupToRestore())}
        >
          {t('backups.restoreOver.open')}
        </button>
      </div>
      {status !== null && (
        <div role="status">
          <p className="field__hint">{status.text}</p>
          {status.missing > 0 && (
            <p className="muted field__hint">{t('backups.missing', { count: status.missing })}</p>
          )}
        </div>
      )}
      {error !== null && (
        <p className="field__error" role="alert">
          {errorMessage(t, error)}
        </p>
      )}

      <p className="muted field__hint">{t('backups.automaticHint')}</p>
      <div className="setting-row">
        <button
          type="button"
          className="button button--ghost"
          onClick={() => void openFolder(() => window.api.backups.openFolder())}
        >
          {t('backups.openFolder')}
        </button>
      </div>

      <div className="setting-row">
        <div className="field">
          <label htmlFor={scheduleId}>{t('backups.schedule.label')}</label>
          <select
            id={scheduleId}
            aria-describedby={`${scheduleId}-hint`}
            value={schedule}
            onChange={(event) =>
              onChange({ key: 'backupSchedule', value: event.target.value as BackupSchedule })
            }
          >
            {BACKUP_SCHEDULES.map((option) => (
              <option key={option} value={option}>
                {t(`backups.schedule.${option}`)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="button button--ghost"
          aria-label={t('backups.schedule.applyToAll')}
          onClick={() => onApplyToAll({ key: 'backupSchedule', value: schedule })}
        >
          {t('settings.applyToAll')}
        </button>
      </div>
      <p id={`${scheduleId}-hint`} className="muted field__hint setting-row__hint">
        {t('backups.schedule.hint')}
      </p>
      {scheduled.data !== null && (
        <p className="field__hint">
          {scheduled.data.lastAt === null
            ? t('backups.schedule.none')
            : t('backups.schedule.last', {
                moment: formatMoment(scheduled.data.lastAt, i18n.language as Language),
              })}
        </p>
      )}
      {scheduled.error !== null && (
        <p className="field__error" role="alert">
          {errorMessage(t, scheduled.error)}
        </p>
      )}
      <div className="setting-row">
        <button
          type="button"
          className="button button--ghost"
          onClick={() => void openFolder(() => window.api.backups.openScheduledFolder({ token }))}
        >
          {t('backups.schedule.openFolder')}
        </button>
      </div>

      {preview !== null && (
        <RestoreOverDialog
          preview={preview}
          profileName={profileName}
          onConfirm={() => void restore(preview)}
          onClose={() => setPreview(null)}
        />
      )}
      {progress !== null && running === 'create' && (
        <BackupProgressDialog
          title={t('backups.creatingTitle')}
          message={t('backups.creating')}
          progress={progress}
        />
      )}
      {progress !== null && running === 'restore' && (
        <BackupProgressDialog
          title={t('backups.restoringTitle')}
          // Restoring over the profile first checks the backup, then saves the current state.
          message={t(
            progress.stage === 'restore'
              ? 'backups.restoreOver.stepRestore'
              : 'backups.restoreOver.stepBackup',
          )}
          progress={progress}
        />
      )}
    </section>
  );
}
