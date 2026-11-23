import { useEffect, useId, useRef, useState, type ReactNode, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { catalogForRole, type Catalog, type ItemRole } from '../../../core/catalogs/catalogs';
import { ValidationError } from '../../../core/errors';
import type { FieldError } from '../../../core/field-errors';
import { ITEM_STATUSES, type ItemStatus } from '../../../core/items/item-draft';
import type { OwnershipFormat } from '../../../core/items/ownership';
import type { CatalogEntrySummary } from '../../../shared/catalogs';
import type { ItemKind } from '../../../shared/content';
import type { IpcResult } from '../../../shared/ipc';
import type { ImageStorageChoice } from '../../../core/media/import-rules';
import type { ItemDetails } from '../../../shared/items';
import type { ItemMedia } from '../../../shared/media';
import type { ImageImportChoice } from '../../../shared/settings';
import { FieldErrorMessage, invalidProps } from '../../components/FieldErrorMessage';
import { errorMessage, unwrap } from '../../lib/ipc';
import { useLoad } from '../../lib/use-load';
import { CoverField } from '../media/CoverField';
import { DocumentsField } from '../media/DocumentsField';
import { ImagesField } from '../media/ImagesField';
import {
  coverChanged,
  documentLabelErrors,
  documentsChanged,
  fromAttachment,
  fromAttachments,
  fromDocumentAttachments,
  imagesChanged,
  preparedDocumentIds,
  preparedIds,
  toCoverPlan,
  toDocumentPlan,
  toImagePlan,
  type FormDocument,
  type FormImage,
} from '../media/media-form';
import { EntryPicker } from './EntryPicker';
import { checkItemForm, hasChanges, toFormState, type ItemFormState } from './item-form';
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
import { UsageDateInput, type DateErrors } from './UsageDateInput';
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

/** Checks the form and the documents' names; the field errors are by form field. */
function checkFields(kind: ItemKind, form: ItemFormState, documents: readonly FormDocument[]) {
  const checked = checkItemForm(kind, form);
  const fieldErrors: readonly FieldError[] = [
    ...checked.fieldErrors,
    ...documentLabelErrors(documents),
  ];
  return { ...checked, draft: fieldErrors.length === 0 ? checked.draft : null, fieldErrors };
}

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
  const [savedDocuments, setSavedDocuments] = useState<readonly FormDocument[]>(() =>
    fromDocumentAttachments(media.documents),
  );
  const [documents, setDocuments] = useState<readonly FormDocument[]>(savedDocuments);
  /** An error that no single field shows (from the main process, for example). */
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const set = (changes: Partial<ItemFormState>) =>
    setForm((current) => ({ ...current, ...changes }));

  /*
   * The fields marked when the user last tried to save. A field stays marked while it still has
   * an error, and stops being marked as soon as it is valid; errors in other fields appear only
   * on the next save.
   */
  const [markedFields, setMarkedFields] = useState<ReadonlySet<string>>(() => new Set());
  const shownErrors =
    markedFields.size === 0
      ? []
      : checkFields(kind, form, documents).fieldErrors.filter(({ field }) =>
          markedFields.has(field),
        );
  if (shownErrors.length !== markedFields.size) {
    // Fields corrected since the last save are dropped while rendering, which React allows
    // for state that follows other state; an effect would draw the old marks once more.
    setMarkedFields(new Set(shownErrors.map(({ field }) => field)));
  }
  const errorFor = (field: string): string | undefined => {
    const found = shownErrors.find((shown) => shown.field === field);
    return found && errorMessage(t, new ValidationError(found.code, found.message));
  };
  const dateErrors = (field: string): DateErrors => ({
    day: errorFor(`${field}.day`),
    month: errorFor(`${field}.month`),
    year: errorFor(`${field}.year`),
  });

  // After a save with errors, the first marked field (in the order shown) gets the focus.
  useEffect(() => {
    if (focusRequest === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusRequest]);

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

  /** Changes the documents; a PDF removed before saving is discarded early. */
  function changeDocuments(next: readonly FormDocument[]) {
    const kept = preparedDocumentIds(next);
    const dropped = preparedDocumentIds(documents).filter((id) => !kept.includes(id));
    if (dropped.length > 0) void window.api.media.discardImports({ token, preparedIds: dropped });
    setDocuments(next);
  }

  async function save(): Promise<ItemDetails | null> {
    // Every error is shown at once; an empty document name also blocks the save.
    const { draft, fieldErrors, otherErrors } = checkFields(kind, form, documents);
    setMarkedFields(new Set(fieldErrors.map(({ field }) => field)));
    const [other] = otherErrors;
    setError(other === undefined ? null : new ValidationError(other.code, other.message));
    if (fieldErrors.length > 0) setFocusRequest((count) => count + 1);
    if (draft === null) return null;
    try {
      // Media are sent only when they changed; they are saved with the item.
      const plan = {
        cover: coverChanged(savedCover, cover) ? toCoverPlan(cover) : undefined,
        images: imagesChanged(savedImages, images) ? toImagePlan(images) : undefined,
        documents: documentsChanged(savedDocuments, documents)
          ? toDocumentPlan(documents)
          : undefined,
      };
      const result = unwrap(
        item
          ? await window.api.items.update({ token, id: item.id, draft, ...plan })
          : await window.api.items.create({ token, kind, draft, ...plan }),
      );
      setSaved(form);
      setSavedCover(cover);
      setSavedImages(images);
      setSavedDocuments(documents);
      return result;
    } catch (caught) {
      setError(caught);
      return null;
    }
  }

  // The guard always sees the latest form and save function.
  const current = {
    form,
    saved,
    cover,
    savedCover,
    images,
    savedImages,
    documents,
    savedDocuments,
  };
  const latest = useRef({ ...current, save });
  useEffect(() => {
    latest.current = { ...current, save };
  });
  useEffect(() => {
    registerGuard({
      isDirty: () =>
        hasChanges(latest.current.form, latest.current.saved) ||
        coverChanged(latest.current.savedCover, latest.current.cover) ||
        imagesChanged(latest.current.savedImages, latest.current.images) ||
        documentsChanged(latest.current.savedDocuments, latest.current.documents),
      save: async () => (await latest.current.save()) !== null,
    });
    return () => registerGuard(null);
  }, [registerGuard]);

  // Leaving the editor drops the imports that were not saved (saved ones are already used up).
  useEffect(
    () => () => {
      const ids = [
        ...preparedIds(latest.current.cover, latest.current.images),
        ...preparedDocumentIds(latest.current.documents),
      ];
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
      <form ref={formRef} className="form item-form" onSubmit={(event) => void submit(event)}>
        <FormSection title={t('items.sections.cover')}>
          <CoverField
            token={token}
            cover={cover}
            onChange={(next) => changeMedia({ cover: next })}
            importChoice={imageImport.choice}
            optimizedMaxSide={imageImport.optimizedMaxSide}
            onRememberChoice={imageImport.onRemember}
            acceptDrops
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
              {...invalidProps(`${id}-title-error`, errorFor('title'))}
            />
            <FieldErrorMessage id={`${id}-title-error`} message={errorFor('title')} />
          </div>

          <fieldset className="fieldset">
            <legend>{t('items.fields.alternateTitles')}</legend>
            {form.alternateTitles.map((title, index) => {
              const errorId = `${id}-alternate-title-${index}-error`;
              const titleError = errorFor(`alternateTitles.${index}`);
              return (
                <div key={index} className="alternate-title">
                  <div className="inline-field">
                    <input
                      type="text"
                      aria-label={t('items.fields.alternateTitle', { number: index + 1 })}
                      value={title}
                      onChange={(event) => setAlternateTitle(index, event.target.value)}
                      {...invalidProps(errorId, titleError)}
                    />
                    <button
                      type="button"
                      className="link-button link-button--danger"
                      aria-label={t('items.fields.removeAlternateTitle', { number: index + 1 })}
                      onClick={() =>
                        set({
                          alternateTitles: form.alternateTitles.filter((_, i) => i !== index),
                        })
                      }
                    >
                      {t('items.fields.remove')}
                    </button>
                  </div>
                  <FieldErrorMessage id={errorId} message={titleError} />
                </div>
              );
            })}
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
              {...invalidProps(`${id}-description-error`, errorFor('description'))}
            />
            <FieldErrorMessage id={`${id}-description-error`} message={errorFor('description')} />
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
              errors={dateErrors('startedOn')}
            />
            <UsageDateInput
              legend={t('items.dates.end')}
              value={form.finishedOn}
              onChange={(finishedOn) => set({ finishedOn })}
              errors={dateErrors('finishedOn')}
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
                  error={errorFor('hours')}
                />
                <NumberField
                  label={t('items.fields.minutes')}
                  value={form.minutes}
                  onChange={(minutes) => set({ minutes })}
                  error={errorFor('minutes')}
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
              {...invalidProps(`${id}-notes-error`, errorFor('notes'))}
            />
            <FieldErrorMessage id={`${id}-notes-error`} message={errorFor('notes')} />
          </div>
        </FormSection>

        <FormSection title={t('items.sections.sheet')}>
          {kind === 'series' && (
            <div className="inline-field">
              <NumberField
                label={t('items.fields.seasons')}
                value={form.seasons}
                onChange={(seasons) => set({ seasons })}
                error={errorFor('seasons')}
              />
              <NumberField
                label={t('items.fields.episodes')}
                value={form.episodes}
                onChange={(episodes) => set({ episodes })}
                error={errorFor('episodes')}
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
            errorsFor={(index) => dateErrors(`releases.${index}`)}
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
          <fieldset className="fieldset">
            <legend>{t('media.documents.title')}</legend>
            <DocumentsField
              token={token}
              documents={documents}
              onChange={changeDocuments}
              errorFor={(index) => errorFor(`documents.${index}`)}
            />
          </fieldset>
        </FormSection>

        {(shownErrors.length > 0 || error !== null) && (
          <p className="banner banner--error" role="alert">
            {[
              shownErrors.length > 0 && t('items.checkFields', { count: shownErrors.length }),
              error !== null && errorMessage(t, error),
            ]
              .filter(Boolean)
              .join(' ')}
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
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error: string | undefined;
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
        {...invalidProps(`${id}-error`, error)}
      />
      <FieldErrorMessage id={`${id}-error`} message={error} />
    </div>
  );
}
