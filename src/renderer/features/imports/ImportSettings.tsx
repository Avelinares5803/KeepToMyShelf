import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ITEM_KINDS, type ItemKind } from '../../../shared/content';
import type { CsvImportError, CsvImportPreview, ImportCounts } from '../../../shared/imports';
import type { Language } from '../../../shared/settings';
import { errorMessage, unwrap } from '../../lib/ipc';
import { BackupProgressDialog, useBackupProgress } from '../backups/BackupProgressDialog';
import { formatMoment } from '../backups/format-moment';
import { CsvDuplicatesDialog } from './CsvDuplicatesDialog';
import { ImportConfirmDialog, ImportDetail } from './ImportConfirmDialog';
import { addsAnything, ImportCountsList } from './ImportCounts';

export interface ImportSettingsProps {
  /** The open profile, which receives the import. */
  token: string;
  profileName: string;
  /** Runs `start` once the item editor (if open) has no unsaved changes, asking if it has. */
  beforeImport: (start: () => void) => void;
  /** Something was imported: what the screens show may have changed. */
  onImported: () => void;
}

type Outcome =
  | { readonly kind: 'message'; readonly text: string }
  | { readonly kind: 'problem'; readonly text: string }
  | {
      readonly kind: 'csvErrors';
      readonly fileName: string;
      readonly errors: readonly CsvImportError[];
      readonly errorCount: number;
    }
  | { readonly kind: 'imported'; readonly fileName: string; readonly counts: ImportCounts };

/** A checked file waiting for the user to confirm. */
interface Confirmation {
  readonly importId: string;
  readonly fileName: string;
  readonly counts: ImportCounts;
  readonly details: ReactNode;
}

/** The "Import" section of the settings dialog; only shown with a profile open. */
export function ImportSettings({
  token,
  profileName,
  beforeImport,
  onImported,
}: ImportSettingsProps) {
  const { t, i18n } = useTranslation();
  const headingId = useId();
  const kindId = useId();
  const [csvKind, setCsvKind] = useState<ItemKind>('game');
  const [duplicates, setDuplicates] = useState<CsvImportPreview | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<unknown>(null);
  const progress = useBackupProgress(running);

  /** Asks to confirm, or says there is nothing to import. */
  function offer(confirming: Confirmation) {
    if (addsAnything(confirming.counts)) {
      setConfirmation(confirming);
    } else {
      setOutcome({
        kind: 'message',
        text: t('imports.nothingNew', { fileName: confirming.fileName }),
      });
    }
  }

  async function chooseJson() {
    setOutcome(null);
    setError(null);
    try {
      // The main process opens the file dialog, reads the file and checks it; nothing is
      // imported until the user confirms.
      const check = unwrap(
        await window.api.imports.preview({ token, filterName: t('imports.fileType') }),
      );
      if (check === null) return;
      if (!check.valid) {
        const { position, title, code } = check.item;
        setOutcome({
          kind: 'problem',
          text: t('imports.invalidItem', {
            position,
            fileName: check.fileName,
            title: title ?? t('imports.untitled'),
            reason: t(`errors.${code}`, { defaultValue: t('errors.unknown') }),
          }),
        });
        return;
      }
      const { preview } = check;
      offer({
        importId: preview.importId,
        fileName: preview.fileName,
        counts: preview.counts,
        details: (
          <>
            <ImportDetail label={t('imports.confirm.profile')}>{preview.profileName}</ImportDetail>
            <ImportDetail label={t('imports.confirm.exportedAt')}>
              {formatMoment(preview.exportedAt, i18n.language as Language)}
            </ImportDetail>
          </>
        ),
      });
    } catch (caught) {
      setError(caught);
    }
  }

  async function chooseCsv() {
    setOutcome(null);
    setError(null);
    try {
      const check = unwrap(
        await window.api.imports.previewCsv({
          token,
          kind: csvKind,
          filterName: t('imports.csv.fileType'),
        }),
      );
      if (check === null) return;
      if (!check.valid) {
        const { fileName, errors, errorCount } = check;
        setOutcome({ kind: 'csvErrors', fileName, errors, errorCount });
      } else if (check.preview.duplicates.length > 0) {
        setDuplicates(check.preview);
      } else {
        offerCsv(check.preview, check.preview.counts);
      }
    } catch (caught) {
      setError(caught);
    }
  }

  function offerCsv(preview: CsvImportPreview, counts: ImportCounts) {
    offer({
      importId: preview.importId,
      fileName: preview.fileName,
      counts,
      details: (
        <ImportDetail label={t('imports.csv.kind')}>{t(`modes.${preview.kind}`)}</ImportDetail>
      ),
    });
  }

  async function chooseRows(preview: CsvImportPreview, skipRows: number[]) {
    const counts = unwrap(
      await window.api.imports.chooseCsvRows({ token, importId: preview.importId, skipRows }),
    );
    setDuplicates(null);
    offerCsv(preview, counts);
  }

  async function confirm(chosen: Confirmation) {
    setConfirmation(null);
    setRunning(true);
    try {
      const counts = unwrap(await window.api.imports.confirm({ token, importId: chosen.importId }));
      setOutcome({ kind: 'imported', fileName: chosen.fileName, counts });
      onImported();
    } catch (caught) {
      setError(caught);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="settings-section" aria-labelledby={headingId}>
      <h3 id={headingId} className="settings-section__title">
        {t('imports.title')}
      </h3>
      <p className="muted field__hint">{t('imports.hint')}</p>
      <div className="setting-row">
        <button
          type="button"
          className="button button--ghost"
          disabled={running}
          onClick={() => beforeImport(() => void chooseJson())}
        >
          {t('imports.open')}
        </button>
      </div>
      <div className="setting-row">
        <div className="field">
          <label htmlFor={kindId}>{t('imports.csv.kind')}</label>
          <select
            id={kindId}
            value={csvKind}
            onChange={(event) => setCsvKind(event.target.value as ItemKind)}
          >
            {ITEM_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(`modes.${kind}`)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="button button--ghost"
          disabled={running}
          onClick={() => beforeImport(() => void chooseCsv())}
        >
          {t('imports.csv.open')}
        </button>
      </div>
      <p className="muted field__hint setting-row__hint">{t('imports.csv.hint')}</p>
      {outcome?.kind === 'problem' && (
        <p className="field__error" role="alert">
          {outcome.text}
        </p>
      )}
      {outcome?.kind === 'csvErrors' && <CsvErrors {...outcome} />}
      {outcome?.kind === 'message' && (
        <p className="field__hint" role="status">
          {outcome.text}
        </p>
      )}
      {outcome?.kind === 'imported' && (
        <div role="status">
          <p className="field__hint">{t('imports.done', { fileName: outcome.fileName })}</p>
          <ImportCountsList counts={outcome.counts} />
        </div>
      )}
      {error !== null && (
        <p className="field__error" role="alert">
          {errorMessage(t, error)}
        </p>
      )}

      {duplicates !== null && (
        <CsvDuplicatesDialog
          preview={duplicates}
          onContinue={(skipRows) => chooseRows(duplicates, skipRows)}
          onClose={() => setDuplicates(null)}
        />
      )}
      {confirmation !== null && (
        <ImportConfirmDialog
          fileName={confirmation.fileName}
          profileName={profileName}
          counts={confirmation.counts}
          details={confirmation.details}
          onConfirm={() => void confirm(confirmation)}
          onClose={() => setConfirmation(null)}
        />
      )}
      {progress !== null && running && (
        <BackupProgressDialog
          title={t('imports.importingTitle')}
          message={t('imports.importing')}
          progress={progress}
        />
      )}
    </section>
  );
}

/** Why a CSV file cannot be imported: each error, by row and column. */
function CsvErrors({
  fileName,
  errors,
  errorCount,
}: {
  fileName: string;
  errors: readonly CsvImportError[];
  errorCount: number;
}) {
  const { t } = useTranslation();
  const line = ({ row, column, code }: CsvImportError) => {
    const reason = t(`errors.${code}`, { defaultValue: t('errors.unknown') });
    if (row === 1) {
      return column === null
        ? t('imports.csv.headerError', { reason })
        : t('imports.csv.columnError', { column, reason });
    }
    return column === null
      ? t('imports.csv.rowError', { row, reason })
      : t('imports.csv.cellError', { row, column, reason });
  };
  return (
    <div className="import-errors" role="alert">
      <p className="field__error">{t('imports.csv.invalid', { count: errorCount, fileName })}</p>
      <ul className="import-errors__list">
        {errors.map((error, index) => (
          <li key={index}>{line(error)}</li>
        ))}
      </ul>
      {errorCount > errors.length && (
        <p className="field__error">
          {t('imports.csv.moreErrors', { count: errorCount - errors.length })}
        </p>
      )}
    </div>
  );
}
