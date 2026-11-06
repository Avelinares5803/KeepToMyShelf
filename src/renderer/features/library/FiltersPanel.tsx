import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import type { ItemKind } from '../../../shared/content';
import type { ItemFilterValues } from '../../../shared/items';
import { countConditions } from './advanced-filters';
import { AdvancedFilters } from './AdvancedFilters';
import {
  activeFilterCount,
  clearedActiveFilter,
  type FilterMode,
  type LibraryView,
} from './library-view';
import { countMarks } from './simple-filters';
import { SimpleFilters } from './SimpleFilters';

const MODES: readonly FilterMode[] = ['simple', 'advanced'];

interface FiltersPanelProps {
  kind: ItemKind;
  view: LibraryView;
  /** Null until they have loaded. */
  values: ItemFilterValues | null;
  onChange: (change: Partial<LibraryView>) => void;
}

/**
 * The two ways to filter. Only one applies: the other one looks switched off and is ignored,
 * but keeps what it holds, ready for coming back to it.
 */
export function FiltersPanel({ kind, view, values, onChange }: FiltersPanelProps) {
  const { t } = useTranslation();
  const [askingFor, setAskingFor] = useState<FilterMode | null>(null);

  const counts: Record<FilterMode, number> = {
    simple: countMarks(view.filters),
    advanced: countConditions(kind, view.advanced),
  };
  const activeCount = activeFilterCount(kind, view);

  // Asks only if something would stop applying.
  const choose = (mode: FilterMode) => {
    if (mode === view.filterMode) return;
    if (activeCount > 0) setAskingFor(mode);
    else onChange({ filterMode: mode });
  };

  return (
    <div className="filters-panel">
      <div className="filters-panel__top">
        {MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            className={`button filters-panel__mode${
              mode === view.filterMode ? ' filters-panel__mode--active' : ''
            }`}
            aria-pressed={mode === view.filterMode}
            onClick={() => choose(mode)}
          >
            {t(`library.filters.${mode}`)}
            {counts[mode] > 0 && ` (${counts[mode]})`}
          </button>
        ))}
        <button
          type="button"
          className="button button--ghost filters-panel__clear"
          disabled={activeCount === 0}
          onClick={() => onChange(clearedActiveFilter(view))}
        >
          {t('library.filters.clear')}
        </button>
      </div>

      {view.filterMode === 'simple' ? (
        <SimpleFilters
          kind={kind}
          filters={view.filters}
          values={values}
          onChange={(filters) => onChange({ filters })}
        />
      ) : (
        <AdvancedFilters
          kind={kind}
          root={view.advanced}
          values={values}
          onChange={(advanced) => onChange({ advanced })}
        />
      )}

      {askingFor !== null && (
        <ConfirmDialog
          title={t(`library.filters.switchTitle.${askingFor}`)}
          confirmLabel={t(`library.filters.switchConfirm.${askingFor}`)}
          onConfirm={() => {
            setAskingFor(null);
            onChange({ filterMode: askingFor });
            return Promise.resolve();
          }}
          onClose={() => setAskingFor(null)}
        >
          <p>{t(`library.filters.switchText.${askingFor}`)}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
