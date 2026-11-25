import { useTranslation } from 'react-i18next';
import type { RestorePreview } from '../../../shared/backups';
import type { Language } from '../../../shared/settings';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { formatMoment } from './format-moment';

interface RestoreOverDialogProps {
  preview: RestorePreview;
  /** Name of the open profile, whose data is replaced (it keeps this name). */
  profileName: string;
  onConfirm: () => void;
  onClose: () => void;
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
