import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImportCounts } from '../../../shared/imports';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ImportCountsList } from './ImportCounts';

interface ImportConfirmDialogProps {
  fileName: string;
  /** Name of the open profile, which receives the import. */
  profileName: string;
  counts: ImportCounts;
  /** What the file tells about itself (where it was exported from, its kind…), as rows. */
  details: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Asks before importing a file into the open profile, showing what it would add. Focus starts
 * on "Cancel" (see ConfirmDialog).
 */
export function ImportConfirmDialog({
  fileName,
  profileName,
  counts,
  details,
  onConfirm,
  onClose,
}: ImportConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <ConfirmDialog
      title={t('imports.confirm.title')}
      confirmLabel={t('imports.confirm.confirm')}
      onClose={onClose}
      onConfirm={async () => onConfirm()}
    >
      <p>{t('imports.confirm.question', { fileName, name: profileName })}</p>
      <dl className="details">{details}</dl>
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

/** A row of the details of the file. */
export function ImportDetail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="details__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
