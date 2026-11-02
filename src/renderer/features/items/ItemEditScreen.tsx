import { useEffect, useId, useRef, useState, type ReactNode, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { catalogForRole, type Catalog, type ItemRole } from '../../../core/catalogs/catalogs';
import { ITEM_STATUSES, type ItemStatus } from '../../../core/items/item-draft';
import type { OwnershipFormat } from '../../../core/items/ownership';
import type { CatalogEntrySummary } from '../../../shared/catalogs';
import type { ItemKind } from '../../../shared/content';
import type { IpcResult } from '../../../shared/ipc';
import type { ImageStorageChoice } from '../../../core/media/import-rules';
import type { ItemDetails } from '../../../shared/items';
import type { ItemMedia } from '../../../shared/media';
import type { ImageImportChoice } from '../../../shared/settings';
import { errorMessage, unwrap } from '../../lib/ipc';
import { useLoad } from '../../lib/use-load';
import { CoverField } from '../media/CoverField';
import { ImagesField } from '../media/ImagesField';
import {
  coverChanged,
  fromAttachment,
  fromAttachments,
  imagesChanged,
  preparedIds,
  toCoverPlan,
  toImagePlan,
  type FormImage,
} from '../media/media-form';
import { EntryPicker } from './EntryPicker';
import { hasChanges, toFormState, toItemDraft, type ItemFormState } from './item-form';
import {
  datesLabel,
  releasesLabel,
  replayLabel,
  roleLabel,
  sheetRoles,
  statusLabel,
} from './labels';
import { ReleaseDatesInput } from './ReleaseDatesInput';
import { StarRatingInput } from './StarRating';
import { UsageDateInput } from './UsageDateInput';
import { useItemTitle } from './use-item-title';

/** Lets the app ask about unsaved changes before leaving the editor. */
export interface EditorGuard {
  isDirty(): boolean;
  /** Saves the form; resolves to false if it could not be saved (the error is shown). */
  save(): Promise<boolean>;
}

interface ItemEditScreenProps {
  token: string;
  kind: ItemKind;
  /** Null to create a new item. */
  itemId: number | null;
  /** Image import preferences of the open profile. */
  imageImport: {
    choice: ImageImportChoice;
    optimizedMaxSide: number;
    onRemember: (choice: ImageStorageChoice) => void;
  };
  registerGuard: (guard: EditorGuard | null) => void;
  onSaved: (item: ItemDetails) => void;
  onCancel: () => void;
}

type CatalogLists = Partial<Record<Catalog, CatalogEntrySummary[]>>;

/** Loads the catalogs whose values the form suggests for an item of `kind`. */
async function loadCatalogs(token: string, kind: ItemKind): Promise<IpcResult<CatalogLists>> {
  const catalogs: Catalog[] = ['region'];
  for (const role of [...sheetRoles(kind), 'franchise', 'owned_on', 'tag'] as ItemRole[]) {
    const catalog = catalogForRole(kind, role);
    if (catalog !== null && !catalogs.includes(catalog)) catalogs.push(catalog);
  }
  const lists: CatalogLists = {};
  for (const catalog of catalogs) {
    const result = await window.api.catalogs.list({ token, catalog });
    if (!result.ok) return result;
    lists[catalog] = result.value;
  }
  return { ok: true, value: lists };
}

export function ItemEditScreen({ token, kind, itemId, ...rest }: ItemEditScreenProps) {
  const { t } = useTranslation();
  const loaded = useLoad(
    () =>
      itemId === null
        ? Promise.resolve({ ok: true as const, value: null })
        : window.api.items.get({ token, id: itemId }),
    [token, itemId],
  );
  const catalogs = useLoad(() => loadCatalogs(token, kind), [token, kind]);
  const media = useLoad(
    () =>
      itemId === null
        ? Promise.resolve({ ok: true as const, value: null })
        : window.api.media.list({ token, itemId }),
    [token, itemId],
  );

  const error = loaded.error ?? catalogs.error ?? media.error;
  if (error !== null) {
    return (
      <p className="banner banner--error" role="alert">
        {errorMessage(t, error)}
      </p>
    );
  }
  // For a new item `data` is null as soon as loading finishes; wait for an existing one.
  if (
    (itemId !== null && (loaded.data === null || media.data === null)) ||
    catalogs.data === null
  ) {
    return null;
  }
  return (
    <ItemForm
      token={token}
      kind={kind}
      item={loaded.data}
      media={media.data ?? NO_MEDIA}
      catalogs={catalogs.data}
      {...rest}
    />
  );
}

type ItemFormProps = Omit<ItemEditScreenProps, 'itemId'> & {
  item: ItemDetails | null;
  media: ItemMedia;
  catalogs: CatalogLists;
};

const FORMATS: OwnershipFormat[] = ['physical', 'digital', 'both'];
const NO_MEDIA: ItemMedia = { cover: null, images: [], documents: [] };

function ItemForm({
  token,
  kind,
  item,
  media,
  catalogs,
  imageImport,
  registerGuard,
  onSaved,
  onCancel,
}: ItemFormProps) {
  const { t } = useTranslation();
  const displayTitle = useItemTitle();
  const id = useId();
  const [saved, setSaved] = useState(() => toFormState(item));
  const [form, setForm] = useState(saved);
  const [savedCover, setSavedCover] = useState<FormImage | null>(() =>
    media.cover === null ? null : fromAttachment(media.cover),
  );
  const [cover, setCover] = useState(savedCover);
  const [savedImages, setSavedImages] = useState<readonly FormImage[]>(() =>
    fromAttachments(media.images),
  );
  const [images, setImages] = useState<readonly FormImage[]>(savedImages);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (changes: Partial<ItemFormState>) =>
    setForm((current) => ({ ...current, ...changes }));

  /**
   * Changes the cover or the gallery. An import neither of them uses any more is discarded
   * early (the same import may be the cover and a gallery image at once).
   */
  function changeMedia(next: { cover?: FormImage | null; images?: readonly FormImage[] }) {
    const nextCover = next.cover === undefined ? cover : next.cover;
    const nextImages = next.images ?? images;
    const kept = preparedIds(nextCover, nextImages);
    const dropped = preparedIds(cover, images).filter((id) => !kept.includes(id));
    // Only frees temporary files early: they are also dropped when the profile closes.
    if (dropped.length > 0) void window.api.media.discardImports({ token, preparedIds: dropped });
    setCover(nextCover);
    setImages(nextImages);
  }

  async function save(): Promise<ItemDetails | null> {
    setError(null);
    try {
      const draft = toItemDraft(kind, form);
      // The cover and the gallery are sent only when they changed; they are saved with the item.
      const plan = {
        cover: coverChanged(savedCover, cover) ? toCoverPlan(cover) : undefined,
        images: imagesChanged(savedImages, images) ? toImagePlan(images) : undefined,
      };
      const result = unwrap(
        item
          ? await window.api.items.update({ token, id: item.id, draft, ...plan })
          : await window.api.items.create({ token, kind, draft, ...plan }),
      );
      setSaved(form);
      setSavedCover(cover);
      setSavedImages(images);
      return result;
    } catch (caught) {
      setError(caught);
      return null;
    }
  }

  // The guard always sees the latest form and save function.
  const latest = useRef({ form, saved, cover, savedCover, images, savedImages, save });
  useEffect(() => {
    latest.current = { form, saved, cover, savedCover, images, savedImages, save };
  });
  useEffect(() => {
    registerGuard({
      isDirty: () =>
        hasChanges(latest.current.form, latest.current.saved) ||
        coverChanged(latest.current.savedCover, latest.current.cover) ||
        imagesChanged(latest.current.savedImages, latest.current.images),
      save: async () => (await latest.current.save()) !== null,
    });
    return () => registerGuard(null);
  }, [registerGuard]);

  // Leaving the editor drops the imports that were not saved (saved ones are already used up).
  useEffect(
    () => () => {
      const ids = preparedIds(latest.current.cover, latest.current.images);
      if (ids.length > 0) void window.api.media.discardImports({ token, preparedIds: ids });
    },
    [token],
  );

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const result = await save();
    setBusy(false);
    if (result) onSaved(result);
  }

  const setAlternateTitle = (index: number, value: string) =>
    set({ alternateTitles: form.alternateTitles.map((title, i) => (i === index ? value : title)) });

  const picker = (role: ItemRole, options: { hideLabel?: boolean } = {}) => {
    const catalog = catalogForRole(kind, role);
    if (catalog === null) return null;
    return (
      <EntryPicker
        label={roleLabel(t, role)}
        hideLabel={options.hideLabel}
        entries={catalogs[catalog] ?? []}
        kind={kind}
        value={form.relations[role] ?? []}
        onChange={(choices) => set({ relations: { ...form.relations, [role]: choices } })}
        reorderable={role === 'actor'}
      />
    );
  };

  return (
    <section className="item-edit">
      <h1>{item ? t('items.editItem', { title: displayTitle(item) }) : t(`items.new.${kind}`)}</h1>
      <form className="form item-form" onSubmit={(event) => void submit(event)}>
        <FormSection title={t('items.sections.cover')}>
          <CoverField
            token={token}
            cover={cover}
            onChange={(next) => changeMedia({ cover: next })}
            importChoice={imageImport.choice}
            optimizedMaxSide={imageImport.optimizedMaxSide}
            onRememberChoice={imageImport.onRemember}
          />
        </FormSection>

        <FormSection title={t('items.sections.identity')}>
          <div className="field">
            <label htmlFor={`${id}-title`}>{t('items.fields.title')}</label>
            <input
              id={`${id}-title`}
              type="text"
              value={form.title}
              placeholder={t('items.fields.titlePlaceholder')}
              autoFocus
              onChange={(event) => set({ title: event.target.value })}
            />
          </div>

          <fieldset className="fieldset">
            <legend>{t('items.fields.alternateTitles')}</legend>
            {form.alternateTitles.map((title, index) => (
              <div key={index} className="inline-field">
                <input
                  type="text"
                  aria-label={t('items.fields.alternateTitle', { number: index + 1 })}
                  value={title}
                  onChange={(event) => setAlternateTitle(index, event.target.value)}
                />
                <button
                  type="button"
                  className="link-button link-button--danger"
                  aria-label={t('items.fields.removeAlternateTitle', { number: index + 1 })}
                  onClick={() =>
                    set({ alternateTitles: form.alternateTitles.filter((_, i) => i !== index) })
                  }
                >
                  {t('items.fields.remove')}
                </button>
              </div>
            ))}
            <button
              type="button"
              className="button button--ghost"
              onClick={() => set({ alternateTitles: [...form.alternateTitles, ''] })}
            >
              {t('items.fields.addAlternateTitle')}
            </button>
          </fieldset>

          <div className="field">
            <label htmlFor={`${id}-description`}>{t('items.fields.description')}</label>
            <textarea
              id={`${id}-description`}
              rows={5}
              value={form.description}
              onChange={(event) => set({ description: event.target.value })}
            />
          </div>

          {picker('franchise')}
        </FormSection>

        <FormSection title={t('items.sections.tracking')}>
          <div className="inline-field">
            <div className="field">
              <label htmlFor={`${id}-status`}>{t('items.fields.status')}</label>
              <select
                id={`${id}-status`}
                value={form.status}
                onChange={(event) => set({ status: event.target.value as ItemStatus | '' })}
              >
                <option value="">{t('items.notSpecified')}</option>
                {ITEM_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(t, kind, status)}
                  </option>
                ))}
              </select>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.isReplay}
                onChange={(event) => set({ isReplay: event.target.checked })}
              />
              {replayLabel(t, kind)}
            </label>
          </div>

          <div className="field">
            <span className="field__label">{t('items.rating.label')}</span>
            <StarRatingInput rating={form.rating} onChange={(rating) => set({ rating })} />
          </div>

          <fieldset className="fieldset">
            <legend>{datesLabel(t, kind)}</legend>
            <UsageDateInput
              legend={t('items.dates.start')}
              value={form.startedOn}
              onChange={(startedOn) => set({ startedOn })}
            />
            <UsageDateInput
              legend={t('items.dates.end')}
              value={form.finishedOn}
              onChange={(finishedOn) => set({ finishedOn })}
            />
          </fieldset>

          {kind === 'game' && (
            <fieldset className="fieldset">
              <legend>{t('items.fields.hoursPlayed')}</legend>
              <div className="inline-field">
                <NumberField
                  label={t('items.fields.hours')}
                  value={form.hours}
                  onChange={(hours) => set({ hours })}
                />
                <NumberField
                  label={t('items.fields.minutes')}
                  value={form.minutes}
                  onChange={(minutes) => set({ minutes })}
                />
              </div>
            </fieldset>
          )}

          <fieldset className="fieldset">
            <legend>{t('items.fields.format')}</legend>
            <div className="radio-row">
              {(['', ...FORMATS] as const).map((format) => (
                <label key={format || 'none'} className="checkbox">
                  <input
                    type="radio"
                    name={`${id}-format`}
                    checked={form.format === format}
                    onChange={() => set({ format })}
                  />
                  {format === '' ? t('items.notSpecified') : t(`items.format.${format}`)}
                </label>
              ))}
            </div>
          </fieldset>

          {picker('owned_on')}

          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.isFavorite}
              onChange={(event) => set({ isFavorite: event.target.checked })}
            />
            {t('items.fields.favorite')}
          </label>

          <div className="field">
            <label htmlFor={`${id}-notes`}>{t('items.fields.notes')}</label>
            <textarea
              id={`${id}-notes`}
              rows={4}
              value={form.notes}
              onChange={(event) => set({ notes: event.target.value })}
            />
          </div>
        </FormSection>

        <FormSection title={t('items.sections.sheet')}>
          {kind === 'series' && (
            <div className="inline-field">
              <NumberField
                label={t('items.fields.seasons')}
                value={form.seasons}
                onChange={(seasons) => set({ seasons })}
              />
              <NumberField
                label={t('items.fields.episodes')}
                value={form.episodes}
                onChange={(episodes) => set({ episodes })}
              />
            </div>
          )}
          {sheetRoles(kind).map((role) => (
            <div key={role}>{picker(role)}</div>
          ))}
          <ReleaseDatesInput
            legend={releasesLabel(t, kind)}
            regions={catalogs.region ?? []}
            kind={kind}
            value={form.releases}
            onChange={(releases) => set({ releases })}
          />
        </FormSection>

        <FormSection title={t('items.sections.tags')}>
          {picker('tag', { hideLabel: true })}
        </FormSection>

        <FormSection title={t('items.sections.media')}>
          <fieldset className="fieldset">
            <legend>{t('media.images.title')}</legend>
            <ImagesField
              token={token}
              images={images}
              onChange={(next) => changeMedia({ images: next })}
              cover={cover}
              onMakeCover={(image) => changeMedia({ cover: image })}
              importChoice={imageImport.choice}
              optimizedMaxSide={imageImport.optimizedMaxSide}
              onRememberChoice={imageImport.onRemember}
            />
          </fieldset>
        </FormSection>

        {error !== null && (
          <p className="banner banner--error" role="alert">
            {errorMessage(t, error)}
          </p>
        )}
        <div className="form__actions">
          <button type="button" className="button button--ghost" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="button button--primary" disabled={busy}>
            {t('common.save')}
          </button>
        </div>
      </form>
    </section>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="form-section">
      <h2 className="form-section__title">{title}</h2>
      {children}
    </section>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        size={6}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
