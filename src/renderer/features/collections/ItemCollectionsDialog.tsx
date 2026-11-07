import { useId, useRef, useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  collectionNameKey,
  normalizeCollectionName,
} from '../../../core/collections/collection-name';
import { ConflictError } from '../../../core/errors';
import type { CollectionName, CollectionSummary } from '../../../shared/collections';
import { Dialog } from '../../components/Dialog';
import { errorMessage, unwrap } from '../../lib/ipc';
import { useLoad } from '../../lib/use-load';
import { changesOf, marksFrom, toggleMark, type MembershipMarks } from './membership-changes';

interface ItemCollectionsDialogProps {
  token: string;
  itemId: number;
  /** The item's title, as shown. */
  title: string;
  onSaved: () => void;
  onClose: () => void;
}

/** A collection typed in this window: it is created, and the item added, when saving. */
interface NewCollection {
  readonly name: string;
  readonly marked: boolean;
}

/**
 * The collections an item belongs to: marking or unmarking adds or removes it. New collections
 * can be named here; they are created only when saving, so cancelling leaves nothing behind.
 */
export function ItemCollectionsDialog({
  token,
  itemId,
  title,
  onSaved,
  onClose,
}: ItemCollectionsDialogProps) {
  const { t } = useTranslation();
  const all = useLoad(() => window.api.collections.list({ token }), [token]);
  const mine = useLoad(() => window.api.collections.forItem({ token, itemId }), [token, itemId]);
  const error = all.error ?? mine.error;

  return (
    <Dialog open title={t('collections.forItem.title', { title })} onClose={onClose}>
      {error !== null && (
        <p className="field__error" role="alert">
          {errorMessage(t, error)}
        </p>
      )}
      {all.data !== null && mine.data !== null && (
        <CollectionChoices
          token={token}
          itemId={itemId}
          collections={all.data}
          memberOf={mine.data}
          onSaved={onSaved}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function CollectionChoices({
  token,
  itemId,
  collections,
  memberOf,
  onSaved,
  onClose,
}: {
  token: string;
  itemId: number;
  collections: readonly CollectionSummary[];
  memberOf: readonly CollectionName[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [marks, setMarks] = useState<MembershipMarks>(() =>
    marksFrom(memberOf.map((collection) => collection.id)),
  );
  const [created, setCreated] = useState<readonly NewCollection[]>([]);
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState<unknown>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const alreadyCreated = useRef(new Map<string, number>());

  // Checked here like the main process does, so a clash is told before anything is saved.
  function addNew(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setNameError(null);
    try {
      const name = normalizeCollectionName(newName);
      const key = collectionNameKey(name);
      const taken = [...collections, ...created].some(
        (collection) => collectionNameKey(collection.name) === key,
      );
      if (taken) {
        throw new ConflictError('collection.duplicate_name', `"${name}" already exists`);
      }
      setCreated([...created, { name, marked: true }]);
      setNewName('');
    } catch (caught) {
      setNameError(caught);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      // New collections first: if a name is refused, the memberships have not changed yet.
      // Those already created are remembered, so trying again does not create them twice.
      const createdIds: number[] = [];
      for (const collection of created.filter((candidate) => candidate.marked)) {
        let newId = alreadyCreated.current.get(collection.name);
        if (newId === undefined) {
          newId = unwrap(await window.api.collections.create({ token, name: collection.name })).id;
          alreadyCreated.current.set(collection.name, newId);
        }
        createdIds.push(newId);
      }
      const { added, removed } = changesOf(marks);
      unwrap(
        await window.api.collections.changeMemberships({
          token,
          add: [...added, ...createdIds].map((collectionId) => ({ collectionId, itemId })),
          remove: removed.map((collectionId) => ({ collectionId, itemId })),
        }),
      );
      onSaved();
    } catch (caught) {
      setError(caught);
      setBusy(false);
    }
  }

  const newFormId = `${id}-new`;
  return (
    <div className="form collection-form">
      {collections.length === 0 && created.length === 0 ? (
        <p className="muted">{t('collections.forItem.none')}</p>
      ) : (
        <ul className="membership__list" aria-label={t('collections.title')}>
          {collections.map((collection) => (
            <li key={collection.id}>
              <label className="membership__option">
                <input
                  type="checkbox"
                  checked={marks.current.has(collection.id)}
                  onChange={() => setMarks(toggleMark(marks, collection.id))}
                />
                <span>{collection.name}</span>
              </label>
            </li>
          ))}
          {created.map((collection, index) => (
            <li key={`new-${collection.name}`}>
              <label className="membership__option">
                <input
                  type="checkbox"
                  checked={collection.marked}
                  onChange={() =>
                    setCreated(
                      created.map((candidate, i) =>
                        i === index ? { ...candidate, marked: !candidate.marked } : candidate,
                      ),
                    )
                  }
                />
                <span>
                  {/* The space keeps "Retro new" apart for screen readers. */}
                  {collection.name}{' '}
                  <span className="badge">{t('collections.forItem.newBadge')}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {/* Enter in the name adds the collection to the list; it never saves the window. */}
      <form id={newFormId} className="inline-field" onSubmit={addNew}>
        <input
          type="text"
          aria-label={t('collections.new')}
          placeholder={t('collections.new')}
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
        />
        <button type="submit" className="button button--ghost">
          {t('collections.forItem.create')}
        </button>
      </form>
      {nameError !== null && (
        <p className="field__error" role="alert">
          {errorMessage(t, nameError)}
        </p>
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
