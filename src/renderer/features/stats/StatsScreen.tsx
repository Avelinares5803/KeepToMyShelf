import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDuration } from '../../../core/items/duration';
import { ITEM_STATUSES } from '../../../core/items/item-draft';
import { ratingToStars } from '../../../core/items/rating';
import { ITEM_KINDS, type ItemKind } from '../../../shared/content';
import type { CountedValue, LibraryStats } from '../../../shared/stats';
import { errorMessage } from '../../lib/ipc';
import { useLoad } from '../../lib/use-load';
import { useStarsText } from '../items/StarRating';

type Selection = ItemKind | 'all';

/** How many values of a long list (genres, platforms) show until "Show all" is pressed. */
const TOP_VALUES = 10;

interface StatsScreenProps {
  token: string;
}

/** Totals and bars of the open profile's library, of one kind or of every kind. */
export function StatsScreen({ token }: StatsScreenProps) {
  const { t } = useTranslation();
  const selectId = useId();
  const [selection, setSelection] = useState<Selection>('all');
  const kind = selection === 'all' ? null : selection;
  const stats = useLoad(() => window.api.stats.get({ token, kind }), [token, kind]);

  return (
    <section className="stats">
      <header className="library__header">
        <h1>{t('stats.title')}</h1>
        <div className="library__actions">
          <div className="inline-field">
            <label htmlFor={selectId}>{t('stats.show')}</label>
            <select
              id={selectId}
              value={selection}
              onChange={(event) => setSelection(event.target.value as Selection)}
            >
              <option value="all">{t('stats.all')}</option>
              {ITEM_KINDS.map((each) => (
                <option key={each} value={each}>
                  {t(`modes.${each}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {stats.error !== null && (
        <p className="banner banner--error" role="alert">
          {errorMessage(t, stats.error)}
        </p>
      )}
      {stats.data?.total === 0 && <p className="muted">{t('stats.empty')}</p>}
      {stats.data && stats.data.total > 0 && <StatsSections stats={stats.data} kind={kind} />}
    </section>
  );
}

/** "game", "screen" (movies and series share their wording) or "all". */
type Wording = 'game' | 'screen' | 'all';

function StatsSections({ stats, kind }: { stats: LibraryStats; kind: ItemKind | null }) {
  const { t, i18n } = useTranslation();
  const formatStars = useStarsText();
  const wording: Wording = kind === null ? 'all' : kind === 'game' ? 'game' : 'screen';
  const number = (value: number) => value.toLocaleString(i18n.language);
  const statusLabel = (status: (typeof ITEM_STATUSES)[number]) =>
    wording === 'all' ? t(`stats.status.${status}`) : t(`items.status.${wording}.${status}`);
  const finishedCount = stats.statuses.completed;

  return (
    <div className="stats__grid">
      <StatsSection title={t('stats.sections.summary')}>
        <dl className="stat-tiles">
          <Tile label={t('stats.summary.total')} value={number(stats.total)} />
          {kind === null &&
            ITEM_KINDS.map((each) => (
              <Tile key={each} label={t(`modes.${each}`)} value={number(stats.byKind[each])} />
            ))}
          <Tile label={t('stats.summary.favorites')} value={number(stats.favorites)} />
          <Tile label={t(`stats.summary.replays.${wording}`)} value={number(stats.replays)} />
          <Tile label={t('items.format.physical')} value={number(stats.physical)} />
          <Tile label={t('items.format.digital')} value={number(stats.digital)} />
        </dl>
      </StatsSection>

      <StatsSection title={t('stats.sections.statuses')}>
        <Bars
          total={stats.total}
          rows={[
            ...ITEM_STATUSES.map((status) => ({
              key: status,
              label: statusLabel(status),
              count: stats.statuses[status],
            })),
            { key: 'none', label: t('stats.status.none'), count: stats.statuses.none },
          ]}
        />
      </StatsSection>

      <StatsSection title={t('stats.sections.ratings')}>
        {stats.ratings.average !== null && (
          <p className="stats__lead">
            {t('stats.ratings.average', {
              stars: formatStars(Math.round(ratingToStars(stats.ratings.average) * 10) / 10),
            })}
          </p>
        )}
        <Bars
          total={stats.total}
          rows={[
            // The highest rating first, as in most rating charts.
            ...stats.ratings.counts
              .map((count, index) => {
                const stars = ratingToStars(index + 1);
                return {
                  key: String(index + 1),
                  label: t('items.rating.set', { count: stars, stars: formatStars(stars) }),
                  count,
                };
              })
              .reverse(),
            { key: 'unrated', label: t('stats.ratings.unrated'), count: stats.ratings.unrated },
          ]}
        />
      </StatsSection>

      {stats.played !== null && (
        <StatsSection title={t('stats.sections.played')}>
          <dl className="stat-tiles">
            <Tile label={t('stats.played.total')} value={formatDuration(stats.played.minutes)} />
            <Tile label={t('stats.played.games')} value={number(stats.played.games)} />
            {stats.played.games > 0 && (
              <Tile
                label={t('stats.played.average')}
                value={formatDuration(Math.round(stats.played.minutes / stats.played.games))}
              />
            )}
          </dl>
        </StatsSection>
      )}

      <StatsSection title={t('stats.sections.finished')}>
        {stats.finishedByYear.length > 0 ? (
          <Bars
            rows={stats.finishedByYear.map(({ year, count }) => ({
              key: String(year),
              label: String(year),
              count,
            }))}
          />
        ) : (
          finishedCount === 0 && <p className="muted">{t('stats.finished.none')}</p>
        )}
        {stats.finishedWithoutDate > 0 && (
          <p className="muted">
            {t('stats.finished.withoutDate', { count: stats.finishedWithoutDate })}
          </p>
        )}
      </StatsSection>

      {stats.gameGenres !== null && (
        <ValuesSection
          title={kind === null ? t('stats.sections.gameGenres') : t('stats.sections.genres')}
          values={stats.gameGenres}
        />
      )}
      {stats.screenGenres !== null && (
        <ValuesSection
          title={kind === null ? t('stats.sections.screenGenres') : t('stats.sections.genres')}
          values={stats.screenGenres}
        />
      )}
      {stats.platforms !== null && (
        <ValuesSection title={t('items.roles.owned_on')} values={stats.platforms} />
      )}
    </div>
  );
}

function StatsSection({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section className="stats__section" aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      {children}
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-tile">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

interface BarRow {
  readonly key: string;
  readonly label: string;
  readonly count: number;
}

/**
 * One bar per row, as long as its count compared with the largest one. The text says it all
 * ("Completed 42 (35 %)"); the bar only draws it, so screen readers skip it. With `total`, each
 * row also shows its share of it.
 */
function Bars({ rows, total }: { rows: readonly BarRow[]; total?: number }) {
  const { i18n } = useTranslation();
  const largest = Math.max(...rows.map((row) => row.count), 0);
  const percent = new Intl.NumberFormat(i18n.language, {
    style: 'percent',
    maximumFractionDigits: 0,
  });
  return (
    <ul className="stat-bars">
      {rows.map(({ key, label, count }) => (
        <li key={key} className="stat-bars__row">
          <span className="stat-bars__label">
            {label}
            <span className="visually-hidden">: </span>
          </span>
          <span className="stat-bars__value">
            {count.toLocaleString(i18n.language)}
            {total !== undefined && total > 0 && (
              <span className="muted"> ({percent.format(count / total)})</span>
            )}
          </span>
          <span className="stat-bars__track" aria-hidden="true">
            {count > 0 && (
              // Never thinner than a sliver, so a count of 1 next to 1 000 still shows.
              <span
                className="stat-bars__fill"
                style={{ width: `max(0.25rem, ${(count / largest) * 100}%)` }}
              />
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Catalog values, the most used first: the first ten, or all of them. */
function ValuesSection({ title, values }: { title: string; values: readonly CountedValue[] }) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const listId = useId();
  const shown = showAll ? values : values.slice(0, TOP_VALUES);
  return (
    <StatsSection title={title}>
      {values.length === 0 ? (
        <p className="muted">{t('stats.noValues')}</p>
      ) : (
        <div id={listId}>
          <Bars rows={shown.map(({ name, count }) => ({ key: name, label: name, count }))} />
        </div>
      )}
      {values.length > TOP_VALUES && (
        <button
          type="button"
          className="link-button"
          aria-expanded={showAll}
          aria-controls={listId}
          onClick={() => setShowAll((current) => !current)}
        >
          {showAll ? t('stats.showFewer') : t('stats.showAll', { count: values.length })}
        </button>
      )}
    </StatsSection>
  );
}
