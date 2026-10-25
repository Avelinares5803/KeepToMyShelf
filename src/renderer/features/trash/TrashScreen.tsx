import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatPartialDate, localDayOf } from '../../../core/dates/format-date';
import { ITEM_KINDS, type ItemKind } from '../../../shared/content';
import type { ItemSummary } from '../../../shared/items';
import type { Language } from '../../../shared/settings';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { errorMessage, unwrap } from '../../lib/ipc';
import { useLoad } from '../../lib/use-load';
import { useItemTitle } from '../items/use-item-title';

type Selection = ItemKind | 'all';

type PendingAction =
  { readonly kind: 'deleteOne'; readonly item: ItemSummary } | { readonly kind: 'empty' } | null;

interface TrashScreenProps {
  token: string;
  /** The library the trash was opened from; shown first. */
  initialKind: ItemKind;
}

export function TrashScreen({ token, initialKind }: TrashScreenProps) {
  const { t, i18n } = useTranslation();
  const displayTitle = useItemTitle();
  const selectId = useId();
  const [selection, setSelection] = useState<Selection>(initialKind);
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<unknown>(null);
  const kindFilter = selection === 'all' ? null : selection;
  const trash = useLoad(
    () => window.api.items.listTrash({ token, kind: kindFilter }),
    [token, kindFilter],
  );
  const items = trash.data ?? [];
  const scope = selection === 'all' ? t('trash.all') : t(`modes.${selection}`);

  async function restore(item: ItemSummary) {
    setError(null);
    try {
      unwrap(await window.api.items.restore({ token, id: item.id }));
      trash.reload();
    } catch (caught) {
      setError(caught);
    }
  }

  return (
    <section className="trash">
      <header className="library__header">
        <h1>{t('trash.title')}</h1>
        <div className="library__actions">
          <div className="inline-field">
            <label htmlFor={selectId}>{t('trash.show')}</label>
            <select
              id={selectId}
              value={selection}
              onChange={(event) => setSelection(event.target.value as Selection)}
            >
              {ITEM_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`modes.${kind}`)}
                </option>
              ))}
              <option value="all">{t('trash.all')}</option>
            </select>
          </div>
          <button
            type="button"
            className="button button--danger"
            disabled={items.length === 0}
            onClick={() => setPending({ kind: 'empty' })}
          >
            {t('trash.emptyTrash')}
          </button>
        </div>
      </header>

      {(error ?? trash.error) !== null && (
        <p className="banner banner--error" role="alert">
          {errorMessage(t, error ?? trash.error)}
        </p>
      )}
      {trash.data?.length === 0 && <p className="muted">{t('trash.empty')}</p>}
      {items.length > 0 && (
        <ul className="trash-list">
          {items.map((item) => (
            <li key={item.id} className="trash-list__row">
              <div>
                <span className="trash-list__title">{displayTitle(item)}</span>
                <span className="muted trash-list__meta">
                  {selection === 'all' && `${t(`items.kind.${item.kind}`)} · `}
                  {item.deletedAt &&
                    t('trash.deletedOn', {
                      date: formatPartialDate(
                        localDayOf(new Date(item.deletedAt)),
                        i18n.language as Language,
                      ),
                    })}
                </span>
              </div>
              <div className="trash-list__actions">
                <button
                  type="button"
                  className="button button--ghost"
                  aria-label={t('trash.restoreItem', { title: displayTitle(item) })}
                  onClick={() => void restore(item)}
                >
                  {t('trash.restore')}
                </button>
                <button
                  type="button"
                  className="link-button link-button--danger"
                  aria-label={t('trash.deletePermanentlyItem', { title: displayTitle(item) })}
                  onClick={() => setPending({ kind: 'deleteOne', item })}
                >
                  {t('trash.deletePermanently')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pending?.kind === 'deleteOne' && (
        <ConfirmDialog
          title={t('trash.deletePermanently')}
          confirmLabel={t('trash.deletePermanently')}
          danger
          onClose={() => setPending(null)}
          onConfirm={async () => {
            unwrap(await window.api.items.deletePermanently({ token, id: pending.item.id }));
            setPending(null);
            trash.reload();
          }}
        >
          <p>{t('trash.deletePermanentlyConfirm', { title: displayTitle(pending.item) })}</p>
        </ConfirmDialog>
      )}
      {pending?.kind === 'empty' && (
        <ConfirmDialog
          title={t('trash.emptyTrash')}
          confirmLabel={t('trash.emptyTrash')}
          danger
          onClose={() => setPending(null)}
          onConfirm={async () => {
            unwrap(await window.api.items.emptyTrash({ token, kind: kindFilter }));
            setPending(null);
            trash.reload();
          }}
        >
          <p>{t('trash.emptyConfirm', { count: items.length, scope })}</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
