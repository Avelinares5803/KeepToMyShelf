import { useTranslation } from 'react-i18next';
import type { ItemKind } from '../../../shared/content';

interface LibraryScreenProps {
  kind: ItemKind;
}

/** Placeholder: the library grid, search and filters arrive in phase F4 onwards. */
export function LibraryScreen({ kind }: LibraryScreenProps) {
  const { t } = useTranslation();

  return (
    <section className="library">
      <h1>{t(`modes.${kind}`)}</h1>
      <p className="muted">{t('library.empty')}</p>
    </section>
  );
}
