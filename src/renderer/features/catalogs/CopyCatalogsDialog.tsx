import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Catalog } from '../../../core/catalogs/catalogs';
import type { CatalogCopyPreview, CatalogCopyResult } from '../../../shared/catalogs';
import type { Profile } from '../../../shared/ipc';
import { Dialog } from '../../components/Dialog';
import { errorMessage, unwrap } from '../../lib/ipc';
import { useLoad } from '../../lib/use-load';
import { CATALOG_ORDER } from './catalog-view';

interface CopyCatalogsDialogProps {
  token: string;
  /** The profiles to copy from: all but the open one. */
  profiles: readonly Profile[];
  /** The values were added; the dialog stays open with the result. */
  onCopied: () => void;
  onClose: () => void;
}

/** Copies catalog values from another profile: chooses the profile and the catalogs. */
export function CopyCatalogsDialog({
  token,
  profiles,
  onCopied,
  onClose,
}: CopyCatalogsDialogProps) {
  const { t } = useTranslation();
  const id = useId();
  const [sourceId, setSourceId] = useState(profiles[0]?.id ?? '');
  const [result, setResult] = useState<CatalogCopyResult | null>(null);

  return (
    <Dialog open title={t('catalogs.copy.title')} onClose={onClose}>
      {result !== null ? (
        <div className="form copy-catalogs">
          <p role="status">
            {t('catalogs.copy.copied', { count: result.copied })},{' '}
            {t('catalogs.copy.alreadyExisted', { count: result.existing })}.
          </p>
          <p className="muted">{t('catalogs.copy.resultHint')}</p>
          <div className="form__actions">
            <button type="button" className="button button--primary" autoFocus onClick={onClose}>
              {t('common.close')}
            </button>
          </div>
        </div>
      ) : (
        <div className="form copy-catalogs">
          <p className="muted">{t('catalogs.copy.hint')}</p>
          <div className="field">
            <label htmlFor={`${id}-source`}>{t('catalogs.copy.source')}</label>
            <select
              id={`${id}-source`}
              value={sourceId}
              onChange={(event) => setSourceId(event.target.value)}
            >
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </div>
          {/* Another profile starts again, without the marks and numbers of the last one. */}
          <CatalogChoices
            key={sourceId}
            token={token}
            sourceProfileId={sourceId}
            onCopied={(copied) => {
              setResult(copied);
              onCopied();
            }}
            onClose={onClose}
          />
        </div>
      )}
    </Dialog>
  );
}

function CatalogChoices({
  token,
  sourceProfileId,
  onCopied,
  onClose,
}: {
  token: string;
  sourceProfileId: string;
  onCopied: (result: CatalogCopyResult) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const preview = useLoad(
    () => window.api.catalogs.previewCopy({ token, sourceProfileId }),
    [token, sourceProfileId],
  );
  const [chosen, setChosen] = useState<readonly Catalog[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function copy() {
    setBusy(true);
    setError(null);
    try {
      onCopied(
        unwrap(await window.api.catalogs.copy({ token, sourceProfileId, catalogs: chosen })),
      );
    } catch (caught) {
      setError(caught);
      setBusy(false);
    }
  }

  const describe = ({ added, existing }: CatalogCopyPreview) =>
    added + existing === 0
      ? t('catalogs.copy.noValues')
      : [
          t('catalogs.copy.new', { count: added }),
          t('catalogs.copy.existing', { count: existing }),
        ].join(' · ');
  const rows = CATALOG_ORDER.flatMap(
    (catalog) => preview.data?.filter((row) => row.catalog === catalog) ?? [],
  );
  const shownError = error ?? preview.error;

  return (
    <>
      {rows.length > 0 && (
        <fieldset className="fieldset copy-catalogs__list">
          <legend>{t('catalogs.copy.catalogs')}</legend>
          {rows.map((row) => (
            <label key={row.catalog} className="checkbox copy-catalogs__option">
              <input
                type="checkbox"
                checked={chosen.includes(row.catalog)}
                disabled={row.added === 0 || busy}
                onChange={(event) =>
                  setChosen(
                    event.target.checked
                      ? [...chosen, row.catalog]
                      : chosen.filter((catalog) => catalog !== row.catalog),
                  )
                }
              />
              <span>
                {t(`catalogs.names.${row.catalog}`)}{' '}
                <span className="muted trash-list__meta">{describe(row)}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {shownError !== null && (
        <p className="field__error" role="alert">
          {errorMessage(t, shownError)}
        </p>
      )}
      <div className="form__actions">
        <button type="button" className="button button--ghost" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="button button--primary"
          disabled={chosen.length === 0 || busy}
          onClick={() => void copy()}
        >
          {t('catalogs.copy.confirm')}
        </button>
      </div>
    </>
  );
}
