import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeForSearch } from '../../../core/text/normalize';
import type { ItemFilterValue } from '../../../shared/items';
import { searchValues } from '../catalogs/catalog-view';

interface ValueComboboxProps {
  label: string;
  /** The values the library uses, by name. */
  values: readonly ItemFilterValue[];
  /** The chosen value, or null. */
  value: number | null;
  onChange: (value: number | null) => void;
}

/**
 * Chooses one value of a long list. Clicking it opens the whole list; typing narrows it down
 * by name or other name, ignoring case and accents. Leaving it with the text half-typed keeps
 * the chosen value; leaving it with no text leaves it without a value.
 */
export function ValueCombobox({ label, values, value, onChange }: ValueComboboxProps) {
  const { t } = useTranslation();
  const id = useId();
  const listRef = useRef<HTMLUListElement>(null);
  /** What is typed; null while nothing is, so the chosen value's name is shown. */
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const chosen = values.find((candidate) => candidate.id === value);
  const options = searchValues(values, text ?? '').map(({ value: option, match }) => ({
    id: option.id,
    label: match.by === 'alias' ? `${option.name} (${match.alias})` : option.name,
  }));
  const showList = open && options.length > 0;
  const showEmpty = open && options.length === 0;
  const optionId = (index: number) => `${id}-option-${index}`;

  // The highlighted value stays in sight while moving with the arrow keys.
  useEffect(() => {
    if (!showList || active < 0) return;
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [showList, active]);

  // Opens the whole list with the chosen value highlighted.
  function openList() {
    if (open) return;
    setOpen(true);
    setActive(text === null ? values.findIndex((candidate) => candidate.id === value) : -1);
  }

  function close() {
    setText(null);
    setOpen(false);
    setActive(-1);
  }

  function choose(chosenId: number) {
    onChange(chosenId);
    close();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) openList();
        else setActive((current) => Math.min(current + 1, options.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive((current) => Math.max(current - 1, 0));
        break;
      case 'Enter': {
        if (!open) return;
        event.preventDefault();
        const highlighted = active >= 0 ? options[active] : undefined;
        // Without a highlighted value, only a value with exactly the typed name is chosen.
        const key = normalizeForSearch(text ?? '');
        const exact = values.find((candidate) => normalizeForSearch(candidate.name) === key);
        const choice = highlighted?.id ?? (text === null ? undefined : exact?.id);
        if (choice !== undefined) choose(choice);
        break;
      }
      case 'Escape':
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
        break;
    }
  }

  return (
    <div className="value-combobox advanced-filters__value">
      <input
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={`${id}-list`}
        aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
        placeholder={t('library.advanced.chooseValue')}
        value={text ?? chosen?.name ?? ''}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={(event) => {
          // Typing replaces the chosen value's name instead of adding to it.
          event.target.select();
          openList();
        }}
        onClick={(event) => {
          // Also with the mouse, whose click would otherwise undo the selection.
          if (text === null) event.currentTarget.select();
          openList();
        }}
        onBlur={() => {
          if (text !== null && text.trim() === '') onChange(null);
          close();
        }}
        onKeyDown={onKeyDown}
      />
      <span className="value-combobox__arrow" aria-hidden="true">
        ▾
      </span>
      {showList && (
        <ul
          ref={listRef}
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          className="entry-picker__list"
        >
          {options.map((option, index) => (
            <li
              key={option.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              className="entry-picker__option"
              // Keeps the focus in the input so the list does not close before the click.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option.id)}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
      {showEmpty && (
        <p className="entry-picker__list value-combobox__empty" role="status">
          {t('library.advanced.noMatches')}
        </p>
      )}
    </div>
  );
}
