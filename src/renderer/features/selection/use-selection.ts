import { useEffect, useState } from 'react';
import { EMPTY_SELECTION, toggled, toggledAll, type Selection } from './selection';

export interface SelectionMode {
  /** True while in "Select" mode: clicking a card marks it instead of opening it. */
  readonly active: boolean;
  readonly selected: Selection;
  readonly start: () => void;
  /** Leaves the mode without changing anything. */
  readonly stop: () => void;
  readonly toggle: (id: number) => void;
  readonly toggleAll: (shownIds: readonly number[]) => void;
}

/**
 * The "Select" mode of a screen. The selection is emptied when the results change
 * (`resultsKey`: search, filters, kind...), and Escape leaves the mode unless a dialog is open,
 * in which case Escape only closes the dialog. Leaving the screen drops it too.
 */
export function useSelection(resultsKey: string): SelectionMode {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<Selection>(EMPTY_SELECTION);

  // Adjusting state while rendering, as React recommends, avoids drawing the old marks once.
  const [shownKey, setShownKey] = useState(resultsKey);
  if (shownKey !== resultsKey) {
    setShownKey(resultsKey);
    setSelected(EMPTY_SELECTION);
  }

  const stop = () => {
    setActive(false);
    setSelected(EMPTY_SELECTION);
  };

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // A dialog is still open while its Escape is handled: that Escape belongs to it.
      if (event.key !== 'Escape' || document.querySelector('dialog[open]') !== null) return;
      setActive(false);
      setSelected(EMPTY_SELECTION);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active]);

  return {
    active,
    selected,
    start: () => setActive(true),
    stop,
    toggle: (id) => setSelected((current) => toggled(current, id)),
    toggleAll: (shownIds) => setSelected((current) => toggledAll(current, shownIds)),
  };
}
