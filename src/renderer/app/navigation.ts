import type { ItemKind } from '../../shared/content';

/** Screens inside an open profile. The profile selection screen lives outside the stack. */
export type Screen =
  | { readonly name: 'modes' }
  | { readonly name: 'library'; readonly kind: ItemKind }
  | {
      readonly name: 'item';
      readonly kind: ItemKind;
      readonly itemId: number;
      readonly label: string;
    }
  /** `itemId` is null when creating a new item. */
  | { readonly name: 'edit'; readonly kind: ItemKind; readonly itemId: number | null }
  | { readonly name: 'trash'; readonly kind: ItemKind };

export interface NavigationState {
  /** History of visited screens; the last one is shown. Never empty. */
  readonly stack: readonly Screen[];
}

export type NavigationAction =
  | { readonly type: 'open'; readonly screen: Screen }
  | { readonly type: 'back' }
  | { readonly type: 'goTo'; readonly index: number }
  /** Swaps the current screen, e.g. the editor of a new item for its detail view. */
  | { readonly type: 'replace'; readonly screen: Screen }
  /** Updates the breadcrumb label of the current item screen (e.g. after renaming). */
  | { readonly type: 'relabel'; readonly label: string }
  | { readonly type: 'reset' };

export const initialNavigation: NavigationState = { stack: [{ name: 'modes' }] };

/** Identity of a screen, ignoring display-only data such as labels. */
function screenKey(screen: Screen): string {
  switch (screen.name) {
    case 'modes':
      return 'modes';
    case 'library':
    case 'trash':
      return `${screen.name}:${screen.kind}`;
    case 'item':
    case 'edit':
      return `${screen.name}:${screen.kind}:${screen.itemId ?? 'new'}`;
  }
}

export function currentScreen(state: NavigationState): Screen {
  return state.stack[state.stack.length - 1] ?? { name: 'modes' };
}

export function canGoBack(state: NavigationState): boolean {
  return state.stack.length > 1;
}

export function navigationReducer(
  state: NavigationState,
  action: NavigationAction,
): NavigationState {
  switch (action.type) {
    case 'open':
      // Re-opening the current screen must not add a duplicate history entry.
      if (screenKey(currentScreen(state)) === screenKey(action.screen)) return state;
      return { stack: [...state.stack, action.screen] };
    case 'back':
      return canGoBack(state) ? { stack: state.stack.slice(0, -1) } : state;
    case 'goTo':
      // Jump to an earlier screen (breadcrumbs), dropping everything after it.
      if (action.index < 0 || action.index >= state.stack.length) return state;
      return { stack: state.stack.slice(0, action.index + 1) };
    case 'replace':
      return { stack: [...state.stack.slice(0, -1), action.screen] };
    case 'relabel': {
      const current = currentScreen(state);
      if (current.name !== 'item' || current.label === action.label) return state;
      return { stack: [...state.stack.slice(0, -1), { ...current, label: action.label }] };
    }
    case 'reset':
      return initialNavigation;
  }
}
