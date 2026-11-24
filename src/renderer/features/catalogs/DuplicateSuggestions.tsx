import { useTranslation } from 'react-i18next';
import type { DuplicateSuggestion } from '../../../core/catalogs/merge';
import type { CatalogEntrySummary } from '../../../shared/catalogs';

interface DuplicateSuggestionsProps {
  suggestions: readonly DuplicateSuggestion<CatalogEntrySummary>[];
  onReview: (suggestion: DuplicateSuggestion<CatalogEntrySummary>) => void;
}

/** Probable duplicates of a catalog, folded. Reviewing one only opens its confirmation. */
export function DuplicateSuggestions({ suggestions, onReview }: DuplicateSuggestionsProps) {
  const { t } = useTranslation();
  return (
    <details className="catalog-duplicates">
      <summary>{t('catalogs.duplicates.title', { count: suggestions.length })}</summary>
      <ul className="catalog-duplicates__list">
        {suggestions.map((suggestion) => {
          const names = { source: suggestion.source.name, target: suggestion.target.name };
          return (
            <li
              key={`${suggestion.source.id}-${suggestion.target.id}`}
              className="catalog-duplicates__row"
            >
              <span>
                {t(
                  suggestion.by === 'name'
                    ? 'catalogs.duplicates.byName'
                    : 'catalogs.duplicates.byAlias',
                  names,
                )}
              </span>
              <button
                type="button"
                className="link-button"
                aria-label={t('catalogs.duplicates.reviewPair', names)}
                onClick={() => onReview(suggestion)}
              >
                {t('catalogs.duplicates.review')}
              </button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
