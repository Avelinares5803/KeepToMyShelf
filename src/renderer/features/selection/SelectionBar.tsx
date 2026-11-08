import { useTranslation } from 'react-i18next';

interface SelectionBarProps {
  /** "3 items selected", in the words of the screen. */
  countLabel: string;
  count: number;
  allSelected: boolean;
  actionLabel: string;
  onToggleAll: () => void;
  onAction: () => void;
  onCancel: () => void;
}

/** The bar fixed at the bottom while selecting: how many, "Select all", the action and Cancel. */
export function SelectionBar({
  countLabel,
  count,
  allSelected,
  actionLabel,
  onToggleAll,
  onAction,
  onCancel,
}: SelectionBarProps) {
  const { t } = useTranslation();

  return (
    <div className="selection-bar" role="toolbar" aria-label={t('selection.bar')}>
      <span className="selection-bar__count" aria-live="polite">
        {countLabel}
      </span>
      <button type="button" className="button button--ghost" onClick={onToggleAll}>
        {allSelected ? t('selection.clearAll') : t('selection.selectAll')}
      </button>
      <button
        type="button"
        className="button button--danger"
        disabled={count === 0}
        onClick={onAction}
      >
        {actionLabel}
      </button>
      <button type="button" className="button button--ghost" onClick={onCancel}>
        {t('common.cancel')}
      </button>
    </div>
  );
}
