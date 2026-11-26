import { useTranslation } from 'react-i18next';
import type { ImportPreview } from '../../../shared/imports';
import type { Language } from '../../../shared/settings';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { formatMoment } from '../backups/format-moment';
import { ImportCountsList } from './ImportCounts';

interface ImportConfirmDialogProps {
  preview: ImportPreview;
  /** Name of the open profile, which receives the import. */
  profileName: string;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Asks before importing a library into the open profile, showing what it would add. Focus
 * starts on "Cancel" (see ConfirmDialog).
 */
export function ImportConfirmDialog({
  preview,
  profileName,
  onConfirm,
  onClose,
}: ImportConfirmDialogProps) {
  const { t, i18n } = useTranslation();
  const { counts } = preview;
  return (
    <ConfirmDialog
      title={t('imports.confirm.title')}
      confirmLabel={t('imports.confirm.confirm')}
      onClose={onClose}
      onConfirm={async () => onConfirm()}
    >
      <p>{t('imports.confirm.question', { fileName: preview.fileName, name: profileName })}</p>
      <dl className="details">
        <div className="details__row">
          <dt>{t('imports.confirm.profile')}</dt>
          <dd>{preview.profileName}</dd>
        </div>
        <div className="details__row">
          <dt>{t('imports.confirm.exportedAt')}</dt>
          <dd>{formatMoment(preview.exportedAt, i18n.language as Language)}</dd>
        </div>
      </dl>
      <ImportCountsList counts={counts} />
      {counts.itemsInTrash > 0 && (
        <p className="muted">{t('imports.confirm.inTrash', { count: counts.itemsInTrash })}</p>
      )}
      {counts.renamedCollections > 0 && (
        <p className="muted">
          {t('imports.confirm.renamed', { count: counts.renamedCollections })}
        </p>
      )}
      {counts.widenedGenres > 0 && (
        <p className="muted">{t('imports.confirm.widened', { count: counts.widenedGenres })}</p>
      )}
      <p className="muted">{t('imports.confirm.warning')}</p>
    </ConfirmDialog>
  );
}
