import { useId, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogEntrySummary } from '../../../shared/catalogs';
import type { ItemKind } from '../../../shared/content';
import {
  exactChoice,
  moveChoice,
  nameToCreate,
  suggestionsFor,
  type EntryChoice,
} from './entry-picker';

interface EntryPickerProps {
  label: string;
  /** Keeps the label for screen readers only, when a heading already says the same. */
  hideLabel?: boolean;
  /** Values of the catalog that provides this field. */
  entries: readonly CatalogEntrySummary[];
  kind: ItemKind;
  value: readonly EntryChoice[];
  onChange: (value: EntryChoice[]) => void;
  /** Only one value can be chosen (e.g. the region of a release date). */
  single?: boolean;
  /** Shows buttons to change the order of the chosen values (e.g. the cast). */
  reorderable?: boolean;
}

type Option = { readonly choice: EntryChoice; readonly label: string; readonly isNew: boolean };

/**
 * Chooses catalog values with suggestions as you type (by name or other name, ignoring case
 * and accents). Suggestions are never chosen on their own: they are picked with a click or
 * with the arrow keys and Enter. "Create «…»" is offered while no value has exactly the
 * typed name; Enter alone only adds a value with exactly that name.
 */
export function EntryPicker({
  label,
  hideLabel = false,
  entries,
  kind,
  value,
  onChange,
  single = false,
  reorderable = false,
}: EntryPickerProps) {
  const { t } = useTranslation();
  const id = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const toCreate = nameToCreate(entries, value, text);
  const options: Option[] = [
    ...suggestionsFor(entries, value, kind, text).map(({ entry, match }) => ({
      choice: { kind: 'existing', id: entry.id, name: entry.name } as const,
      label: match.by === 'alias' ? `${entry.name} (${match.alias})` : entry.name,
      isNew: false,
    })),
    ...(toCreate === null
      ? []
      : [{ choice: { kind: 'new', name: toCreate } as const, label: toCreate, isNew: true }]),
  ];
  const showList = open && options.length > 0 && !(single && value.length > 0);

  // The list closes after choosing so it does not cover the rest of the form; typing or the
  // down arrow opens it again.
  function add(choice: EntryChoice) {
    onChange([...value, choice]);
    setText('');
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setOpen(true);
        setActive((current) => Math.min(current + 1, options.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive((current) => Math.max(current - 1, -1));
        break;
      case 'Enter': {
        // Enter never submits the item form from here while something is typed.
        if (text.trim() === '' && active < 0) return;
        event.preventDefault();
        const highlighted = active >= 0 ? options[active] : undefined;
        const choice = highlighted?.choice ?? exactChoice(entries, value, text);
        if (choice) add(choice);
        break;
      }
      case 'Escape':
        if (showList) {
          event.preventDefault();
          setOpen(false);
          setActive(-1);
        }
        break;
    }
  }

  const optionId = (index: number) => `${id}-option-${index}`;

  return (
    <div className="field entry-picker">
      <label htmlFor={`${id}-input`} className={hideLabel ? 'visually-hidden' : undefined}>
        {label}
      </label>
      {value.length > 0 && (
        <ul className="chips" aria-label={t('items.relations.chosen', { field: label })}>
          {value.map((choice, index) => (
            <li
              key={choice.kind === 'existing' ? `id:${choice.id}` : `new:${choice.name}`}
              className="chip"
            >
              <span>{choice.name}</span>
              {choice.kind === 'new' && (
                <span className="chip__new">{t('items.relations.new')}</span>
              )}
              {reorderable && (
                <>
                  <button
                    type="button"
                    className="chip__button"
                    aria-label={t('items.relations.moveEarlier', { name: choice.name })}
                    disabled={index === 0}
                    onClick={() => onChange(moveChoice(value, index, -1))}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className="chip__button"
                    aria-label={t('items.relations.moveLater', { name: choice.name })}
                    disabled={index === value.length - 1}
                    onClick={() => onChange(moveChoice(value, index, 1))}
                  >
                    →
                  </button>
                </>
              )}
              <button
                type="button"
                className="chip__button"
                aria-label={t('items.relations.remove', { name: choice.name, field: label })}
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {!(single && value.length > 0) && (
        <div className="entry-picker__control">
          <input
            id={`${id}-input`}
            type="text"
            role="combobox"
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls={`${id}-list`}
            aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
            placeholder={t('items.relations.placeholder')}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              setOpen(false);
              setActive(-1);
            }}
            onKeyDown={onKeyDown}
          />
          {showList && (
            <ul id={`${id}-list`} role="listbox" aria-label={label} className="entry-picker__list">
              {options.map((option, index) => (
                <li
                  key={
                    option.isNew
                      ? 'new'
                      : `id:${option.choice.kind === 'existing' ? option.choice.id : ''}`
                  }
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === active}
                  className="entry-picker__option"
                  // Keeps the focus in the input so the list does not close before the click.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => add(option.choice)}
                >
                  {option.isNew
                    ? t('items.relations.create', { name: option.label })
                    : option.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
