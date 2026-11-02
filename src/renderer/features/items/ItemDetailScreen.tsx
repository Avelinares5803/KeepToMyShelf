import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ItemRole } from '../../../core/catalogs/catalogs';
import { formatPartialDate, localDayOf } from '../../../core/dates/format-date';
import { describeUsagePeriod, type UsageDate } from '../../../core/dates/usage-period';
import { formatDuration } from '../../../core/items/duration';
import { toOwnershipFormat } from '../../../core/items/ownership';
import type { Language } from '../../../shared/settings';
import type { ItemDetails } from '../../../shared/items';
import type { ItemKind } from '../../../shared/content';
import type { MediaAttachment } from '../../../shared/media';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { AllImagesDialog } from '../media/AllImagesDialog';
import { ImageStrip } from '../media/ImageStrip';
import { ImageViewer } from '../media/ImageViewer';
import { Thumbnail } from '../media/Thumbnail';
import { HeartIcon, PencilIcon, TrashIcon } from '../../components/icons';
import { errorMessage, unwrap } from '../../lib/ipc';
import { useLoad } from '../../lib/use-load';
import { toFormState, toItemDraft } from './item-form';
import {
  datesLabel,
  releasesLabel,
  replayLabel,
  roleLabel,
  sheetRoles,
  statusLabel,
} from './labels';
import { StarRating } from './StarRating';
import { useItemTitle } from './use-item-title';

interface ItemDetailScreenProps {
  token: string;
  kind: ItemKind;
  itemId: number;
  onEdit: () => void;
  onTrashed: () => void;
  /** Reports the visible title so the breadcrumbs can show it. */
  onTitle: (title: string) => void;
}

export function ItemDetailScreen(props: ItemDetailScreenProps) {
  const { t } = useTranslation();
  const { token, itemId } = props;
  const loaded = useLoad(() => window.api.items.get({ token, id: itemId }), [token, itemId]);
  const media = useLoad(() => window.api.media.list({ token, itemId }), [token, itemId]);

  const error = loaded.error ?? media.error;
  if (error !== null) {
    return (
      <p className="banner banner--error" role="alert">
        {errorMessage(t, error)}
      </p>
    );
  }
  if (loaded.data === null || media.data === null) return null;
  return (
    <ItemDetail
      {...props}
      item={loaded.data}
      images={media.data.images}
      onChanged={loaded.reload}
    />
  );
}

function ItemDetail({
  token,
  kind,
  item,
  images,
  onEdit,
  onTrashed,
  onTitle,
  onChanged,
}: ItemDetailScreenProps & {
  item: ItemDetails;
  images: readonly MediaAttachment[];
  onChanged: () => void;
}) {
  const { t, i18n } = useTranslation();
  const displayTitle = useItemTitle();
  const title = displayTitle(item);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // Index of the image open in the full-screen viewer, and whether "See all" is open.
  const [viewing, setViewing] = useState<number | null>(null);
  const [seeingAll, setSeeingAll] = useState(false);
  const cover = images[0];
  const language = i18n.language as Language;
  const formatDate = (value: UsageDate) =>
    value.kind === 'unknown' ? t('items.dates.unknown') : formatPartialDate(value.date, language);

  useEffect(() => onTitle(title), [onTitle, title]);

  async function toggleFavorite() {
    setError(null);
    try {
      const draft = toItemDraft(kind, { ...toFormState(item), isFavorite: !item.isFavorite });
      unwrap(await window.api.items.update({ token, id: item.id, draft }));
      onChanged();
    } catch (caught) {
      setError(caught);
    }
  }

  const format = toOwnershipFormat(item);
  const period = describeUsagePeriod(item.startedOn, item.finishedOn);
  const status = [
    item.status === null ? null : statusLabel(t, kind, item.status),
    item.isReplay ? replayLabel(t, kind) : null,
  ]
    .filter((part) => part !== null)
    .join(' · ');

  const relationRow = (role: ItemRole) => {
    const entries = item.relations[role] ?? [];
    if (entries.length === 0) return null;
    return (
      <Row key={role} label={roleLabel(t, role)}>
        {entries.map((entry) => entry.name).join(', ')}
      </Row>
    );
  };

  return (
    <article className="item-detail">
      <header className="item-detail__header">
        <h1>{title}</h1>
        <div className="item-detail__actions">
          <button
            type="button"
            className={`icon-button${item.isFavorite ? ' icon-button--active' : ''}`}
            aria-label={item.isFavorite ? t('items.unmarkFavorite') : t('items.markFavorite')}
            aria-pressed={item.isFavorite}
            onClick={() => void toggleFavorite()}
          >
            <HeartIcon filled={item.isFavorite} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={t('items.edit')}
            title={t('items.edit')}
            onClick={onEdit}
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={t('items.delete')}
            title={t('items.delete')}
            onClick={() => setConfirmingDelete(true)}
          >
            <TrashIcon />
          </button>
        </div>
      </header>
      {error !== null && (
        <p className="banner banner--error" role="alert">
          {errorMessage(t, error)}
        </p>
      )}

      <div className={`item-detail__body${cover ? ' item-detail__body--cover' : ''}`}>
        {cover && (
          <div className="item-detail__cover">
            {cover.isMissing ? (
              <Thumbnail
                sha256={cover.sha256}
                width={cover.width ?? 1}
                height={cover.height ?? 1}
                alt=""
                missing
              />
            ) : (
              <button
                type="button"
                className="image-button"
                aria-label={t('media.view.openCover')}
                onClick={() => setViewing(0)}
              >
                <Thumbnail
                  className="image-button__image"
                  sha256={cover.sha256}
                  width={cover.width ?? 1}
                  height={cover.height ?? 1}
                  alt={t('media.view.coverOf', { title })}
                />
              </button>
            )}
          </div>
        )}
        <dl className="details">
          {item.alternateTitles.length > 0 && (
            <Row label={t('items.fields.alternateTitles')}>
              <ul className="plain-list">
                {item.alternateTitles.map((alternate) => (
                  <li key={alternate}>{alternate}</li>
                ))}
              </ul>
            </Row>
          )}
          {item.description !== null && (
            <Row label={t('items.fields.description')}>
              <p className="long-text">{item.description}</p>
            </Row>
          )}
          {relationRow('franchise')}
          {status !== '' && <Row label={t('items.fields.status')}>{status}</Row>}
          {item.rating !== null && (
            <Row label={t('items.rating.label')}>
              <StarRating rating={item.rating} />
            </Row>
          )}
          {period.kind === 'single' && (
            <Row label={datesLabel(t, kind)}>{formatPartialDate(period.date, language)}</Row>
          )}
          {period.kind === 'period' && (
            <Row label={datesLabel(t, kind)}>
              {period.start && (
                <div>
                  {t('items.dates.start')}: {formatDate(period.start)}
                </div>
              )}
              {period.end && (
                <div>
                  {t('items.dates.end')}: {formatDate(period.end)}
                </div>
              )}
            </Row>
          )}
          {kind === 'game' && item.minutesPlayed !== null && (
            <Row label={t('items.fields.hoursPlayed')}>{formatDuration(item.minutesPlayed)}</Row>
          )}
          {format !== null && (
            <Row label={t('items.fields.format')}>{t(`items.format.${format}`)}</Row>
          )}
          {relationRow('owned_on')}
          {item.notes !== null && (
            <Row label={t('items.fields.notes')}>
              <p className="long-text">{item.notes}</p>
            </Row>
          )}
          {kind === 'series' && item.seasonsCount !== null && (
            <Row label={t('items.fields.seasons')}>{item.seasonsCount}</Row>
          )}
          {kind === 'series' && item.episodesCount !== null && (
            <Row label={t('items.fields.episodes')}>{item.episodesCount}</Row>
          )}
          {sheetRoles(kind).map(relationRow)}
          {item.releases.length > 0 && (
            <Row label={releasesLabel(t, kind)}>
              <ul className="plain-list">
                {item.releases.map(({ region, date }, index) => (
                  <li key={index}>
                    {region === null
                      ? formatPartialDate(date, language)
                      : `${region.name}: ${formatPartialDate(date, language)}`}
                  </li>
                ))}
              </ul>
            </Row>
          )}
          {relationRow('tag')}
        </dl>
      </div>

      {images.length > 0 && (
        <section className="item-detail__media" aria-labelledby={`${item.id}-media`}>
          <h2 id={`${item.id}-media`} className="form-section__title">
            {t('items.sections.media')}
          </h2>
          <h3 className="item-detail__media-title">{t('media.images.title')}</h3>
          <ImageStrip images={images} onOpen={setViewing} onSeeAll={() => setSeeingAll(true)} />
        </section>
      )}

      <dl className="details">
        <Row label={t('items.fields.addedOn')}>
          {formatPartialDate(localDayOf(new Date(item.createdAt)), language)}
        </Row>
      </dl>

      {seeingAll && (
        <AllImagesDialog
          title={title}
          images={images}
          onOpen={setViewing}
          onClose={() => setSeeingAll(false)}
        />
      )}
      {viewing !== null && (
        <ImageViewer images={images} startIndex={viewing} onClose={() => setViewing(null)} />
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title={t('items.delete')}
          confirmLabel={t('items.delete')}
          danger
          onClose={() => setConfirmingDelete(false)}
          onConfirm={async () => {
            unwrap(await window.api.items.moveToTrash({ token, id: item.id }));
            onTrashed();
          }}
        >
          <p>{t('items.deleteConfirm', { title })}</p>
        </ConfirmDialog>
      )}
    </article>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="details__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
