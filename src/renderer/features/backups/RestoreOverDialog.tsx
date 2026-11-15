import { useTranslation } from 'react-i18next';
import { formatPartialDate, localDayOf } from '../../../core/dates/format-date';
import type { RestorePreview } from '../../../shared/backups';
import type { Language } from '../../../shared/settings';
import { ConfirmDialog } from '../../components/ConfirmDialog';

interface RestoreOverDialogProps {
  preview: RestorePreview;
  /** Name of the open profile, whose data is replaced (it keeps this name). */
  profileName: string;
  onConfirm: () => void;
  onClose: () => void;
}

/** "14/11/2026, 18:30" or "14 Nov 2026, 18:30", in local time. */
function formatMoment(iso: string, language: Language): string {
  const moment = new Date(iso);
  const time = `${String(moment.getHours()).padStart(2, '0')}:${String(moment.getMinutes()).padStart(2, '0')}`;
  return `${formatPartialDate(localDayOf(moment), language)}, ${time}`;
}

/**
 * Asks before restoring a backup over the open profile, showing what the backup holds. Focus
 * starts on "Cancel" (see ConfirmDialog).
 */
export function RestoreOverDialog({
  preview,
  profileName,
  onConfirm,
  onClose,
}: RestoreOverDialogProps) {
  const { t, i18n } = useTranslation();
  return (
    <ConfirmDialog
      title={t('backups.restoreOver.title')}
      confirmLabel={t('backups.restoreOver.confirm')}
      danger
      onClose={onClose}
      onConfirm={async () => onConfirm()}
    >
      <p>{t('backups.restoreOver.question', { name: profileName })}</p>
      <dl className="details">
        <div className="details__row">
          <dt>{t('backups.restoreOver.file')}</dt>
          <dd>{preview.fileName}</dd>
        </div>
        <div className="details__row">
          <dt>{t('backups.restoreOver.profile')}</dt>
          <dd>{preview.profileName}</dd>
        </div>
        <div className="details__row">
          <dt>{t('backups.restoreOver.createdAt')}</dt>
          <dd>{formatMoment(preview.createdAt, i18n.language as Language)}</dd>
        </div>
        <div className="details__row">
          <dt>{t('backups.restoreOver.files')}</dt>
          <dd>{preview.files}</dd>
        </div>
      </dl>
      <p className="muted">{t('backups.restoreOver.warning')}</p>
    </ConfirmDialog>
  );
}
