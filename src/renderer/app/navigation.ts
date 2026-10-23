import type { ItemKind } from '../../shared/content';

/** Screens inside an open profile. The profile selection screen lives outside the stack. */
export type Screen =
  { readonly name: 'modes' } | { readonly name: 'library'; readonly kind: ItemKind };

export interface NavigationState {
  /** History of visited screens; the last one is shown. Never empty. */
  readonly stack: readonly Screen[];
}

export type NavigationAction =
  | { readonly type: 'open'; readonly screen: Screen }
  | { readonly type: 'back' }
  | { readonly type: 'goTo'; readonly index: number }
  | { readonly type: 'reset' };

export const initialNavigation: NavigationState = { stack: [{ name: 'modes' }] };

function sameScreen(a: Screen, b: Screen): boolean {
  return a.name === b.name && (a.name !== 'library' || b.name !== 'library' || a.kind === b.kind);
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
      if (sameScreen(currentScreen(state), action.screen)) return state;
      return { stack: [...state.stack, action.screen] };
    case 'back':
      return canGoBack(state) ? { stack: state.stack.slice(0, -1) } : state;
    case 'goTo':
      // Jump to an earlier screen (breadcrumbs), dropping everything after it.
      if (action.index < 0 || action.index >= state.stack.length) return state;
      return { stack: state.stack.slice(0, action.index + 1) };
    case 'reset':
      return initialNavigation;
  }
}
