import { useTranslation } from 'react-i18next';
import type { ImportCounts } from '../../../shared/imports';

/** The counts shown as rows, in this order; rows with nothing are left out. */
const ROWS = [
  'items',
  'existingItems',
  'catalogValues',
  'collections',
  'updatedCollections',
] as const satisfies readonly (keyof ImportCounts)[];

/** Whether importing adds anything at all (items that already exist add nothing). */
export function addsAnything(counts: ImportCounts): boolean {
  return ROWS.some((row) => row !== 'existingItems' && counts[row] > 0);
}

/** What an import adds, or would add, as a list of figures. */
export function ImportCountsList({ counts }: { counts: ImportCounts }) {
  const { t } = useTranslation();
  return (
    <dl className="details">
      {ROWS.filter((row) => counts[row] > 0).map((row) => (
        <div key={row} className="details__row">
          <dt>{t(`imports.counts.${row}`)}</dt>
          <dd>{counts[row]}</dd>
        </div>
      ))}
    </dl>
  );
}
