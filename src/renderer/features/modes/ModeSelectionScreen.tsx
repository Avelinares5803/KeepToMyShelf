import { useTranslation } from 'react-i18next';
import { ITEM_KINDS, type ItemKind } from '../../../shared/content';
import { CollectionIcon, FilmIcon, GamepadIcon, ListIcon, TvIcon } from '../../components/icons';

interface ModeSelectionScreenProps {
  onSelect: (kind: ItemKind) => void;
  onOpenCollections: () => void;
  onOpenCatalogs: () => void;
}

const ICONS: Record<ItemKind, () => React.JSX.Element> = {
  game: GamepadIcon,
  movie: FilmIcon,
  series: TvIcon,
};

export function ModeSelectionScreen({
  onSelect,
  onOpenCollections,
  onOpenCatalogs,
}: ModeSelectionScreenProps) {
  const { t } = useTranslation();

  return (
    <section className="modes">
      <h1>{t('modes.title')}</h1>
      <ul className="mode-grid">
        {ITEM_KINDS.map((kind) => {
          const KindIcon = ICONS[kind];
          return (
            <li key={kind}>
              <button type="button" className="mode-card" onClick={() => onSelect(kind)}>
                <KindIcon />
                <span className="mode-card__label">{t(`modes.${kind}`)}</span>
              </button>
            </li>
          );
        })}
        <li>
          <button type="button" className="mode-card" onClick={onOpenCollections}>
            <CollectionIcon />
            <span className="mode-card__label">{t('collections.title')}</span>
          </button>
        </li>
      </ul>
      <button
        type="button"
        className="button button--ghost modes__catalogs"
        onClick={onOpenCatalogs}
      >
        <ListIcon /> {t('catalogs.title')}
      </button>
    </section>
  );
}
