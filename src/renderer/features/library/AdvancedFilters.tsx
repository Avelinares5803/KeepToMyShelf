import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { type ItemRole, ITEM_ROLES } from '../../../core/catalogs/catalogs';
import {
  filterFieldFor,
  operatorsFor,
  type FilterOperator,
  type FilterSource,
} from '../../../core/filters/filter-fields';
import type { ItemStatus } from '../../../core/items/item-draft';
import { RATING_MAX, RATING_MIN, ratingToStars } from '../../../core/items/rating';
import type { ItemKind } from '../../../shared/content';
import type { ItemFilterValues } from '../../../shared/items';
import {
  notReplayPluralLabel,
  replayLabel,
  replayPluralLabel,
  roleLabel,
  statusLabel,
} from '../items/labels';
import { useStarsText } from '../items/StarRating';
import {
  addCondition,
  addGroup,
  fieldsToOffer,
  MAX_GROUP_LEVELS,
  parseValue,
  removeNode,
  setField,
  setGroupOp,
  setOperator,
  setValue,
  type AdvancedCondition,
  type AdvancedGroup,
} from './advanced-filters';
import { FORMAT_OPTIONS } from './simple-filters';

const RATINGS = Array.from({ length: RATING_MAX - RATING_MIN + 1 }, (_, i) => RATING_MAX - i);

interface AdvancedFiltersProps {
  kind: ItemKind;
  root: AdvancedGroup;
  /** Null until they have loaded. */
  values: ItemFilterValues | null;
  onChange: (root: AdvancedGroup) => void;
}

/** Conditions in groups, each group with its own way to combine them. */
export function AdvancedFilters({ kind, root, values, onChange }: AdvancedFiltersProps) {
  const { t } = useTranslation();
  return (
    <section className="advanced-filters" aria-label={t('library.filters.advanced')}>
      <Group group={root} level={1} kind={kind} root={root} values={values} onChange={onChange} />
      <p className="muted advanced-filters__hint">{t('library.advanced.hint')}</p>
    </section>
  );
}

interface NodeProps extends AdvancedFiltersProps {
  level: number;
}

function Group({
  group,
  level,
  kind,
  root,
  values,
  onChange,
}: NodeProps & { group: AdvancedGroup }) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className={level > 1 ? 'advanced-filters__group' : undefined}>
      <div className="inline-field advanced-filters__combine">
        <label htmlFor={id}>{t('library.advanced.match')}</label>
        <select
          id={id}
          value={group.op}
          onChange={(event) =>
            onChange(setGroupOp(root, group.id, event.target.value as 'and' | 'or'))
          }
        >
          <option value="and">{t('library.advanced.all')}</option>
          <option value="or">{t('library.advanced.any')}</option>
        </select>
      </div>

      <div className="advanced-filters__children">
        {group.children.map((child) =>
          child.type === 'group' ? (
            <Group
              key={child.id}
              group={child}
              level={level + 1}
              kind={kind}
              root={root}
              values={values}
              onChange={onChange}
            />
          ) : (
            <Condition
              key={child.id}
              condition={child}
              kind={kind}
              root={root}
              values={values}
              onChange={onChange}
            />
          ),
        )}
      </div>

      <div className="advanced-filters__actions">
        <button
          type="button"
          className="button button--ghost"
          onClick={() => onChange(addCondition(root, group.id))}
        >
          {t('library.advanced.addCondition')}
        </button>
        {level < MAX_GROUP_LEVELS && (
          <button
            type="button"
            className="button button--ghost"
            onClick={() => onChange(addGroup(root, group.id))}
          >
            {t('library.advanced.addGroup')}
          </button>
        )}
        {level > 1 && (
          <button
            type="button"
            className="button button--ghost"
            onClick={() => onChange(removeNode(root, group.id))}
          >
            {t('library.advanced.removeGroup')}
          </button>
        )}
      </div>
    </div>
  );
}

interface ValueOption {
  readonly value: string;
  readonly label: string;
}

function Condition({
  condition,
  kind,
  root,
  values,
  onChange,
}: Omit<NodeProps, 'level'> & { condition: AdvancedCondition }) {
  const { t } = useTranslation();
  const formatStars = useStarsText();
  const source =
    condition.field === null ? undefined : filterFieldFor(kind, condition.field)?.source;

  const fieldLabel = (field: string) => {
    if (ITEM_ROLES.includes(field as ItemRole)) return roleLabel(t, field as ItemRole);
    switch (field) {
      case 'replay':
        return replayLabel(t, kind);
      case 'favorite':
        return t('items.fields.favorite');
      case 'rating':
        return t('items.rating.label');
      default:
        return t(`items.fields.${field}`);
    }
  };

  const valueOptions = (from: FilterSource): ValueOption[] => {
    switch (from.type) {
      case 'role':
        return (values?.[from.role] ?? []).map(({ id, name }) => ({
          value: String(id),
          label: name,
        }));
      case 'choice':
        return from.values.map((value) => ({
          value,
          label: statusLabel(t, kind, value as ItemStatus),
        }));
      case 'flag':
        return condition.field === 'favorite'
          ? [
              { value: 'true', label: t('library.filters.favorite') },
              { value: 'false', label: t('library.advanced.notFavorite') },
            ]
          : [
              { value: 'true', label: replayPluralLabel(t, kind) },
              { value: 'false', label: notReplayPluralLabel(t, kind) },
            ];
      case 'flags':
        return FORMAT_OPTIONS.map((value) => ({
          value,
          label: t(`items.format.${value}`),
        }));
      case 'rating':
        return RATINGS.map((rating) => {
          const stars = ratingToStars(rating);
          return {
            value: String(rating),
            label: t('items.rating.set', { count: stars, stars: formatStars(stars) }),
          };
        });
    }
  };

  const operators = source ? operatorsFor(source) : [];

  return (
    <div className="advanced-filters__condition inline-field">
      <select
        aria-label={t('library.advanced.field')}
        value={condition.field ?? ''}
        onChange={(event) =>
          onChange(setField(root, condition.id, kind, event.target.value || null))
        }
      >
        <option value="">{t('library.advanced.chooseField')}</option>
        {fieldsToOffer(kind, values).map((field) => (
          <option key={field} value={field}>
            {fieldLabel(field)}
          </option>
        ))}
      </select>

      {operators.length > 1 && (
        <select
          aria-label={t('library.advanced.operator')}
          value={condition.operator}
          onChange={(event) =>
            onChange(setOperator(root, condition.id, event.target.value as FilterOperator))
          }
        >
          {operators.map((operator) => (
            <option key={operator} value={operator}>
              {t(`library.advanced.operators.${operator}`)}
            </option>
          ))}
        </select>
      )}

      {source && condition.operator !== 'isEmpty' && (
        <select
          className="advanced-filters__value"
          aria-label={t('library.advanced.value')}
          value={condition.value === null ? '' : String(condition.value)}
          onChange={(event) =>
            onChange(setValue(root, condition.id, parseValue(source, event.target.value)))
          }
        >
          <option value="">{t('library.advanced.chooseValue')}</option>
          {valueOptions(source).map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      )}

      <button
        type="button"
        className="button button--ghost"
        aria-label={t('library.advanced.removeCondition')}
        title={t('library.advanced.removeCondition')}
        onClick={() => onChange(removeNode(root, condition.id))}
      >
        ✕
      </button>
    </div>
  );
}
