import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImportedBackground } from '../../../shared/backgrounds';
import { BACKGROUND_PRESETS, type BackgroundChoice } from '../../../shared/settings';
import { backgroundThumbnailSource } from '../../lib/media-url';
import { PRESET_SOURCES } from './presets';

interface BackgroundPickerProps {
  value: BackgroundChoice;
  /** The common gallery of imported backgrounds, oldest first. */
  gallery: readonly ImportedBackground[];
  onChange: (choice: BackgroundChoice) => void;
  /** When given, imported backgrounds offer to be deleted. `number` is their visible number. */
  onDelete?: (background: ImportedBackground, number: number) => void;
  /** A last tile, e.g. the button that imports backgrounds. */
  children?: ReactNode;
}

const sameChoice = (a: BackgroundChoice, b: BackgroundChoice): boolean =>
  a.kind === b.kind && (a.kind === 'none' || a.id === (b as typeof a).id);

/**
 * The backgrounds to choose from: none, those that come with the app and the imported ones.
 * They are radio buttons, so the arrow keys move the choice, like any group of options.
 */
export function BackgroundPicker({
  value,
  gallery,
  onChange,
  onDelete,
  children,
}: BackgroundPickerProps) {
  const { t } = useTranslation();
  const name = useId();
  const labelId = useId();

  const option = (
    key: string,
    choice: BackgroundChoice,
    label: string,
    preview: ReactNode,
    action?: ReactNode,
  ) => {
    const checked = sameChoice(choice, value);
    return (
      <li key={key} className="background-option">
        <label
          className={`background-option__tile${checked ? ' background-option__tile--selected' : ''}`}
        >
          <input
            type="radio"
            className="background-option__input"
            name={name}
            checked={checked}
            onChange={() => onChange(choice)}
          />
          <span className="background-option__preview">{preview}</span>
          <span className="background-option__name">{label}</span>
        </label>
        {action}
      </li>
    );
  };

  return (
    <div role="radiogroup" aria-labelledby={labelId} className="background-picker">
      <span id={labelId} className="visually-hidden">
        {t('background.label')}
      </span>
      <ul className="background-picker__grid">
        {option('none', { kind: 'none' }, t('background.none'), null)}
        {BACKGROUND_PRESETS.map((id) =>
          option(
            `preset:${id}`,
            { kind: 'preset', id },
            t(`background.presets.${id}`),
            <img src={PRESET_SOURCES[id]} alt="" loading="lazy" />,
          ),
        )}
        {gallery.map((background, index) => {
          const number = index + 1;
          const thumbnail = backgroundThumbnailSource(background.sha256);
          return option(
            `imported:${background.id}`,
            { kind: 'imported', id: background.id },
            t('background.imported', { number }),
            background.isMissing ? (
              <span className="background-option__missing">{t('background.missing')}</span>
            ) : (
              <img src={thumbnail.src} srcSet={thumbnail.srcSet} alt="" loading="lazy" />
            ),
            onDelete && (
              <button
                type="button"
                className="background-option__delete"
                aria-label={t('background.deleteLabel', { number })}
                title={t('background.delete')}
                onClick={() => onDelete(background, number)}
              >
                <span aria-hidden="true">×</span>
              </button>
            ),
          );
        })}
        {children && <li className="background-option">{children}</li>}
      </ul>
    </div>
  );
}
