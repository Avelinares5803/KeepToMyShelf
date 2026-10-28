import { useId, useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Catalog, GenreScope } from '../../../core/catalogs/catalogs';
import type { CatalogEntrySummary } from '../../../shared/catalogs';
import { Dialog } from '../../components/Dialog';
import { errorMessage, unwrap } from '../../lib/ipc';

interface CatalogEntryDialogProps {
  token: string;
  catalog: Catalog;
  /** Null to add a new value. */
  entry: CatalogEntrySummary | null;
  onSaved: () => void;
  onClose: () => void;
}

const SCOPES = ['', 'movie', 'series'] as const;

/** Adds or edits a catalog value: its name, other names and, for movie/series genres, scope. */
export function CatalogEntryDialog({
  token,
  catalog,
  entry,
  onSaved,
  onClose,
}: CatalogEntryDialogProps) {
  const { t } = useTranslation();
  const id = useId();
  const [name, setName] = useState(entry?.name ?? '');
  const [aliases, setAliases] = useState<string[]>(entry ? [...entry.aliases] : []);
  const [scope, setScope] = useState<GenreScope | ''>(entry?.scope ?? '');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const input = { name, aliases, scope: scope === '' ? null : scope };
    try {
      unwrap(
        entry
          ? await window.api.catalogs.update({ token, id: entry.id, entry: input })
          : await window.api.catalogs.create({ token, catalog, entry: input }),
      );
      onSaved();
    } catch (caught) {
      setError(caught);
      setBusy(false);
    }
  }

  const title = entry
    ? t('catalogs.editDialog.title', { name: entry.name })
    : t('catalogs.addDialog.title', { catalog: t(`catalogs.names.${catalog}`) });

  return (
    <Dialog open title={title} onClose={onClose}>
      <form className="form" onSubmit={(event) => void submit(event)}>
        <div className="field">
          <label htmlFor={`${id}-name`}>{t('catalogs.fields.name')}</label>
          <input
            id={`${id}-name`}
            type="text"
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <fieldset className="fieldset">
          <legend>{t('catalogs.fields.aliases')}</legend>
          <p className="muted field__hint">{t('catalogs.fields.aliasesHint')}</p>
          {aliases.map((alias, index) => (
            <div key={index} className="inline-field">
              <input
                type="text"
                aria-label={t('catalogs.fields.alias', { number: index + 1 })}
                value={alias}
                onChange={(event) =>
                  setAliases(aliases.map((a, i) => (i === index ? event.target.value : a)))
                }
              />
              <button
                type="button"
                className="link-button link-button--danger"
                aria-label={t('catalogs.fields.removeAlias', { number: index + 1 })}
                onClick={() => setAliases(aliases.filter((_, i) => i !== index))}
              >
                {t('items.fields.remove')}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="button button--ghost"
            onClick={() => setAliases([...aliases, ''])}
          >
            {t('catalogs.fields.addAlias')}
          </button>
        </fieldset>

        {catalog === 'screen_genre' && (
          <div className="field">
            <label htmlFor={`${id}-scope`}>{t('catalogs.fields.scope')}</label>
            <select
              id={`${id}-scope`}
              value={scope}
              onChange={(event) => setScope(event.target.value as GenreScope | '')}
            >
              {SCOPES.map((option) => (
                <option key={option || 'both'} value={option}>
                  {t(`catalogs.scope.${option || 'both'}`)}
                </option>
              ))}
            </select>
          </div>
        )}

        {error !== null && (
          <p className="field__error" role="alert">
            {errorMessage(t, error)}
          </p>
        )}
        <div className="form__actions">
          <button type="button" className="button button--ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="button button--primary" disabled={busy}>
            {t('common.save')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
