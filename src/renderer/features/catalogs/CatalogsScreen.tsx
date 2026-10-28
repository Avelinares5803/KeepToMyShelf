import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Catalog } from '../../../core/catalogs/catalogs';
import type { CatalogEntrySummary } from '../../../shared/catalogs';
import { ITEM_KINDS, type ItemKind } from '../../../shared/content';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PlusIcon } from '../../components/icons';
import { errorMessage, unwrap } from '../../lib/ipc';
import { useLoad } from '../../lib/use-load';
import { CatalogEntryDialog } from './CatalogEntryDialog';
import {
  CATALOG_ORDER,
  initialCatalog,
  KIND_FILTERED_CATALOGS,
  usageCount,
  visibleEntries,
  type KindFilter,
} from './catalog-view';

type PendingAction =
  | { readonly kind: 'add' }
  | { readonly kind: 'edit'; readonly entry: CatalogEntrySummary }
  | { readonly kind: 'delete'; readonly entry: CatalogEntrySummary }
  | { readonly kind: 'deleteUnused'; readonly count: number }
  | null;

interface CatalogsScreenProps {
  token: string;
  /** The library the screen was opened from, or null when opened from the mode selection. */
  initialKind: ItemKind | null;
}

/** Lists and manages the reusable values (catalogs) of the open profile. */
export function CatalogsScreen({ token, initialKind }: CatalogsScreenProps) {
  const { t } = useTranslation();
  const id = useId();
  const [catalog, setCatalog] = useState<Catalog>(() => initialCatalog(initialKind));
  const [kind, setKind] = useState<KindFilter>(initialKind);
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<PendingAction>(null);
  const entries = useLoad(() => window.api.catalogs.list({ token, catalog }), [token, catalog]);

  const filtered = KIND_FILTERED_CATALOGS.includes(catalog);
  // Unused values are only listed (and can only be deleted) when all values are shown.
  const kindShown = filtered ? kind : null;
  const all = entries.data ?? [];
  const visible = visibleEntries(all, catalog, kindShown, query);
  const unused = all.filter((entry) => entry.usage.total === 0).length;
  const catalogName = t(`catalogs.names.${catalog}`);

  const close = () => setPending(null);
  const closeAndReload = () => {
    setPending(null);
    entries.reload();
  };

  return (
    <section className="catalogs">
      <header className="library__header">
        <h1>{t('catalogs.title')}</h1>
      </header>

      <div className="catalogs__layout">
        <nav aria-label={t('catalogs.listLabel')}>
          <ul className="catalogs__nav">
            {CATALOG_ORDER.map((option) => (
              <li key={option}>
                <button
                  type="button"
                  className="catalogs__nav-button"
                  aria-current={option === catalog ? 'true' : undefined}
                  onClick={() => {
                    setCatalog(option);
                    setQuery('');
                  }}
                >
                  {t(`catalogs.names.${option}`)}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="catalogs__panel">
          <div className="catalogs__toolbar">
            <h2>
              {catalogName}
              {entries.data && <span className="library__count"> ({visible.length})</span>}
            </h2>
            <div className="library__actions">
              <button
                type="button"
                className="button button--primary"
                onClick={() => setPending({ kind: 'add' })}
              >
                <PlusIcon /> {t('catalogs.add')}
              </button>
              {kindShown === null && (
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={unused === 0}
                  onClick={() => setPending({ kind: 'deleteUnused', count: unused })}
                >
                  {t('catalogs.deleteUnused')}
                </button>
              )}
            </div>
          </div>

          <div className="inline-field catalogs__filters">
            <input
              type="search"
              className="catalogs__search"
              aria-label={t('catalogs.search', { catalog: catalogName })}
              placeholder={t('catalogs.search', { catalog: catalogName })}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {filtered && (
              <div className="inline-field">
                <label htmlFor={`${id}-kind`}>{t('catalogs.show')}</label>
                <select
                  id={`${id}-kind`}
                  value={kind ?? 'all'}
                  onChange={(event) =>
                    setKind(event.target.value === 'all' ? null : (event.target.value as ItemKind))
                  }
                >
                  {ITEM_KINDS.map((option) => (
                    <option key={option} value={option}>
                      {t(`modes.${option}`)}
                    </option>
                  ))}
                  <option value="all">{t('catalogs.allValues')}</option>
                </select>
              </div>
            )}
          </div>

          {entries.error !== null && (
            <p className="banner banner--error" role="alert">
              {errorMessage(t, entries.error)}
            </p>
          )}
          {entries.data && visible.length === 0 && (
            <p className="muted">
              {query.trim() !== ''
                ? t('catalogs.noMatches')
                : kindShown !== null
                  ? t('catalogs.noneForKind', { kind: t(`modes.${kindShown}`) })
                  : t('catalogs.empty')}
            </p>
          )}
          {visible.length > 0 && (
            <ul className="catalog-list">
              {visible.map((entry) => (
                <li key={entry.id} className="trash-list__row">
                  <div>
                    <span className="trash-list__title">
                      {entry.name}
                      {entry.scope && (
                        <span className="badge">{t(`catalogs.scope.${entry.scope}`)}</span>
                      )}
                    </span>
                    {entry.aliases.length > 0 && (
                      <span className="muted trash-list__meta catalog-list__aliases">
                        {t('catalogs.alsoKnownAs', { names: entry.aliases.join(', ') })}
                      </span>
                    )}
                  </div>
                  <div className="trash-list__actions">
                    <span className="muted trash-list__meta">
                      {t('catalogs.usage', { count: usageCount(entry, kindShown) })}
                    </span>
                    <button
                      type="button"
                      className="link-button"
                      aria-label={t('catalogs.editValue', { name: entry.name })}
                      onClick={() => setPending({ kind: 'edit', entry })}
                    >
                      {t('catalogs.edit')}
                    </button>
                    <button
                      type="button"
                      className="link-button link-button--danger"
                      aria-label={t('catalogs.deleteValue', { name: entry.name })}
                      onClick={() => setPending({ kind: 'delete', entry })}
                    >
                      {t('catalogs.delete')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {(pending?.kind === 'add' || pending?.kind === 'edit') && (
        <CatalogEntryDialog
          token={token}
          catalog={catalog}
          entry={pending.kind === 'edit' ? pending.entry : null}
          onSaved={closeAndReload}
          onClose={close}
        />
      )}
      {pending?.kind === 'delete' && (
        <ConfirmDialog
          title={t('catalogs.deleteDialog.title')}
          confirmLabel={t('catalogs.delete')}
          danger
          onClose={close}
          onConfirm={async () => {
            unwrap(await window.api.catalogs.delete({ token, id: pending.entry.id }));
            closeAndReload();
          }}
        >
          <p>
            {pending.entry.usage.total > 0
              ? t('catalogs.deleteDialog.used', {
                  name: pending.entry.name,
                  count: pending.entry.usage.total,
                })
              : t('catalogs.deleteDialog.unused', { name: pending.entry.name })}
          </p>
        </ConfirmDialog>
      )}
      {pending?.kind === 'deleteUnused' && (
        <ConfirmDialog
          title={t('catalogs.deleteUnused')}
          confirmLabel={t('catalogs.deleteUnused')}
          danger
          onClose={close}
          onConfirm={async () => {
            unwrap(await window.api.catalogs.deleteUnused({ token, catalog }));
            closeAndReload();
          }}
        >
          <p>{t('catalogs.deleteUnusedConfirm', { count: pending.count, catalog: catalogName })}</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
