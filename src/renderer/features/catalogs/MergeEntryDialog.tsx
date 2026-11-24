import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { aliasesGained, mergeScope } from '../../../core/catalogs/merge';
import { normalizeForSearch } from '../../../core/text/normalize';
import type { CatalogEntrySummary } from '../../../shared/catalogs';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Dialog } from '../../components/Dialog';
import { unwrap } from '../../lib/ipc';
import { matchEntry } from './catalog-view';

/** Most values drawn at once: a long list is narrowed down by searching. */
const MAX_SHOWN_ENTRIES = 100;

interface MergeEntryDialogProps {
  token: string;
  /** Every value of the catalog. */
  entries: readonly CatalogEntrySummary[];
  initialSource: CatalogEntrySummary;
  /** Null to choose it first. */
  initialTarget: CatalogEntrySummary | null;
  onMerged: () => void;
  onClose: () => void;
}

/** Merges a catalog value into another: chooses the value to keep, then asks. */
export function MergeEntryDialog({
  token,
  entries,
  initialSource,
  initialTarget,
  onMerged,
  onClose,
}: MergeEntryDialogProps) {
  const { t } = useTranslation();
  const [source, setSource] = useState(initialSource);
  const [target, setTarget] = useState(initialTarget);

  if (target === null) {
    return <TargetPicker entries={entries} source={source} onPick={setTarget} onClose={onClose} />;
  }

  const names = { source: source.name, target: target.name };
  const gained = aliasesGained(target, source);
  return (
    <ConfirmDialog
      title={t('catalogs.merge.confirmTitle')}
      confirmLabel={t('catalogs.merge.confirm')}
      danger
      onClose={onClose}
      onConfirm={async () => {
        unwrap(
          await window.api.catalogs.merge({ token, sourceId: source.id, targetId: target.id }),
        );
        onMerged();
      }}
    >
      <div className="merge-confirm">
        <p>{t('catalogs.merge.effect', { ...names, count: source.usage.total })}</p>
        {gained.length > 0 && (
          <p>{t('catalogs.merge.aliases', { target: target.name, names: gained.join(', ') })}</p>
        )}
        {mergeScope(target.scope, source.scope) !== target.scope && (
          <p>{t('catalogs.merge.scope', { target: target.name })}</p>
        )}
        <p>{t('catalogs.merge.irreversible')}</p>
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setSource(target);
            setTarget(source);
          }}
        >
          {t('catalogs.merge.swap')}
        </button>
      </div>
    </ConfirmDialog>
  );
}

function TargetPicker({
  entries,
  source,
  onPick,
  onClose,
}: {
  entries: readonly CatalogEntrySummary[];
  source: CatalogEntrySummary;
  onPick: (entry: CatalogEntrySummary) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const key = normalizeForSearch(query);
  const matches = entries.filter(
    (entry) => entry.id !== source.id && matchEntry(entry, key) !== null,
  );
  const shown = matches.slice(0, MAX_SHOWN_ENTRIES);
  const searchLabel = t('catalogs.search', { catalog: t(`catalogs.names.${source.catalog}`) });

  return (
    <Dialog open title={t('catalogs.merge.pickTitle', { name: source.name })} onClose={onClose}>
      <div className="form">
        <p className="muted merge-hint">{t('catalogs.merge.pickHint')}</p>
        <div className="field">
          <input
            type="search"
            aria-label={searchLabel}
            placeholder={searchLabel}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {matches.length === 0 && <p className="muted">{t('catalogs.noMatches')}</p>}
        {shown.length > 0 && (
          <ul className="membership__list">
            {shown.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className="membership__option item-cover-picker__option"
                  onClick={() => onPick(entry)}
                >
                  <span>
                    {entry.name}{' '}
                    <span className="muted trash-list__meta">
                      {t('catalogs.usage', { count: entry.usage.total })}
                      {entry.aliases.length > 0 &&
                        ` · ${t('catalogs.alsoKnownAs', { names: entry.aliases.join(', ') })}`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {matches.length > shown.length && (
          <p className="muted">
            {t('library.filters.tooMany', { shown: shown.length, total: matches.length })}
          </p>
        )}
        <div className="form__actions">
          <button type="button" className="button button--ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
