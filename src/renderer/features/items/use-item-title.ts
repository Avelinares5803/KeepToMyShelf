import { useTranslation } from 'react-i18next';

interface Titled {
  readonly title: string | null;
  readonly placeholderNumber: number | null;
}

/** Visible title of an item: its own, or "Untitled N" in the current UI language. */
export function useItemTitle(): (item: Titled) => string {
  const { t } = useTranslation();
  return (item) => item.title ?? t('items.untitled', { number: item.placeholderNumber });
}
