import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ITEM_KINDS, type ItemKind } from '../../../shared/content';
import { Dialog } from '../../components/Dialog';
import { errorMessage, unwrap } from '../../lib/ipc';
import { useDebounced } from '../../lib/use-debounced';
import { useLoad } from '../../lib/use-load';
import { useItemTitle } from '../items/use-item-title';
import { Thumbnail } from '../media/Thumbnail';
import { changesOf, marksFrom, toggleMark, type MembershipMarks } from './membership-changes';

const SEARCH_DELAY_MS = 250;
/** Most items drawn at once: a long list is narrowed down by searching. */
const MAX_SHOWN_ITEMS = 100;

interface CollectionItemsDialogProps {
  token: string;
  collectionId: number;
  collectionName: string;
  /** The kind listed first. */
  initialKind: ItemKind;
  onSaved: () => void;
  onClose: () => void;
}

/**
 * Adds items to a collection and removes them, one kind at a time. Marks are kept while
 * switching kinds or searching, and only the changes are saved, all at once.
 */
export function CollectionItemsDialog({
  token,
  collectionId,
  collectionName,
  initialKind,
  onSaved,
  onClose,
}: CollectionItemsDialogProps) {
  const { t } = useTranslation();
  const members = useLoad(
    () => window.api.collections.memberIds({ token, id: collectionId }),
    [token, collectionId],
  );
  // Null until the user marks something: until then, the members as loaded.
  const [changed, setMarks] = useState<MembershipMarks | null>(null);
  const marks = changed ?? (members.data === null ? null : marksFrom(members.data));

  return (
    <Dialog open title={t('collections.items.title', { name: collectionName })} onClose={onClose}>
      {marks === null ? (
        members.error !== null && (
          <p className="field__error" role="alert">
            {errorMessage(t, members.error)}
          </p>
        )
      ) : (
        <MembershipForm
          token={token}
          collectionId={collectionId}
          initialKind={initialKind}
          marks={marks}
          onMarks={setMarks}
          onSaved={onSaved}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function MembershipForm({
  token,
  collectionId,
  initialKind,
  marks,
  onMarks,
  onSaved,
  onClose,
}: {
  token: string;
  collectionId: number;
  initialKind: ItemKind;
  marks: MembershipMarks;
  onMarks: (marks: MembershipMarks) => void;
  onSaved: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const displayTitle = useItemTitle();
  const [kind, setKind] = useState(initialKind);
  const [search, setSearch] = useState('');
  const searchText = useDebounced(search, SEARCH_DELAY_MS).trim();
  // Untitled items are found by the name they show, which depends on the UI language.
  const untitledLabel = t('items.untitled', { number: '' }).trim();
  const items = useLoad(
    () =>
      window.api.items.list({
        token,
        kind,
        ...(searchText.length > 0 && { search: { text: searchText, untitledLabel } }),
      }),
    [token, kind, searchText, untitledLabel],
  );
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const { added, removed } = changesOf(marks);
  const shown = items.data?.slice(0, MAX_SHOWN_ITEMS) ?? [];

  async function save() {
    setBusy(true);
    setError(null);
    try {
      unwrap(
        await window.api.collections.changeMemberships({
          token,
          add: added.map((itemId) => ({ collectionId, itemId })),
          remove: removed.map((itemId) => ({ collectionId, itemId })),
        }),
      );
      onSaved();
    } catch (caught) {
      setError(caught);
      setBusy(false);
    }
  }

  return (
    <div className="form collection-form">
      <div className="inline-field membership__controls">
        <label htmlFor={`${id}-kind`}>{t('collections.items.kind')}</label>
        <select
          id={`${id}-kind`}
          value={kind}
          onChange={(event) => setKind(event.target.value as ItemKind)}
        >
          {ITEM_KINDS.map((option) => (
            <option key={option} value={option}>
              {t(`modes.${option}`)}
            </option>
          ))}
        </select>
        <input
          type="search"
          className="membership__search"
          aria-label={t('library.search')}
          placeholder={t('library.search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {(items.error ?? error) !== null && (
        <p className="field__error" role="alert">
          {errorMessage(t, items.error ?? error)}
        </p>
      )}
      {items.data?.length === 0 && (
        <p className="muted">
          {searchText.length > 0 ? t('library.noResults') : t('collections.items.noneOfKind')}
        </p>
      )}
      {shown.length > 0 && (
        <ul className="membership__list" aria-label={t(`modes.${kind}`)}>
          {shown.map((item) => (
            <li key={item.id}>
              <label className="membership__option">
                <input
                  type="checkbox"
                  checked={marks.current.has(item.id)}
                  onChange={() => onMarks(toggleMark(marks, item.id))}
                />
                <span className="membership__cover" aria-hidden="true">
                  {item.cover && (
                    <Thumbnail
                      sha256={item.cover.sha256}
                      width={item.cover.width}
                      height={item.cover.height}
                      alt=""
                      whenMissing="nothing"
                    />
                  )}
                </span>
                <span>{displayTitle(item)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {items.data && items.data.length > shown.length && (
        <p className="muted">
          {t('library.filters.tooMany', { shown: shown.length, total: items.data.length })}
        </p>
      )}

      <p className="muted membership__changes" role="status">
        {added.length + removed.length > 0 &&
          [
            added.length > 0 && t('collections.items.added', { count: added.length }),
            removed.length > 0 && t('collections.items.removed', { count: removed.length }),
          ]
            .filter(Boolean)
            .join(' · ')}
      </p>
      <div className="form__actions">
        <button type="button" className="button button--ghost" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="button button--primary"
          disabled={busy}
          onClick={() => void save()}
        >
          {t('common.save')}
        </button>
      </div>
    </div>
  );
}
