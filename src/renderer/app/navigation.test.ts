import { describe, expect, it } from 'vitest';
import {
  canGoBack,
  currentScreen,
  initialNavigation,
  navigationReducer,
  type NavigationAction,
  type NavigationState,
} from './navigation';

const run = (...actions: NavigationAction[]): NavigationState =>
  actions.reduce(navigationReducer, initialNavigation);

const games = { name: 'library', kind: 'game' } as const;
const movies = { name: 'library', kind: 'movie' } as const;

describe('navigationReducer', () => {
  it('starts on the mode selection screen with no way back', () => {
    expect(currentScreen(initialNavigation)).toEqual({ name: 'modes' });
    expect(canGoBack(initialNavigation)).toBe(false);
  });

  it('opens screens on top of the history', () => {
    const state = run({ type: 'open', screen: games });

    expect(currentScreen(state)).toEqual(games);
    expect(canGoBack(state)).toBe(true);
  });

  it('goes back to the previous screen', () => {
    const state = run({ type: 'open', screen: games }, { type: 'back' });

    expect(state).toEqual(initialNavigation);
  });

  it('ignores back on the first screen', () => {
    expect(run({ type: 'back' })).toEqual(initialNavigation);
  });

  it('does not duplicate the current screen when opened again', () => {
    const state = run({ type: 'open', screen: games }, { type: 'open', screen: games });

    expect(state.stack).toHaveLength(2);
  });

  it('treats libraries of different kinds as different screens', () => {
    const state = run(
      { type: 'open', screen: games },
      { type: 'back' },
      { type: 'open', screen: movies },
    );

    expect(state.stack).toEqual([{ name: 'modes' }, movies]);
  });

  it('jumps to an earlier screen, dropping later ones', () => {
    const state = run({ type: 'open', screen: games }, { type: 'goTo', index: 0 });

    expect(state).toEqual(initialNavigation);
  });

  it('ignores jumps outside the history', () => {
    const before = run({ type: 'open', screen: games });

    expect(navigationReducer(before, { type: 'goTo', index: 5 })).toBe(before);
    expect(navigationReducer(before, { type: 'goTo', index: -1 })).toBe(before);
  });

  it('treats item screens as the same screen regardless of their label', () => {
    const item = { name: 'item', kind: 'game', itemId: 7, label: 'Zelda' } as const;
    const state = run(
      { type: 'open', screen: item },
      { type: 'open', screen: { ...item, label: 'Renamed' } },
    );

    expect(state.stack).toHaveLength(2);
  });

  it('replaces the current screen, e.g. a new item editor with its detail view', () => {
    const state = run(
      { type: 'open', screen: games },
      { type: 'open', screen: { name: 'edit', kind: 'game', itemId: null } },
      { type: 'replace', screen: { name: 'item', kind: 'game', itemId: 1, label: 'Zelda' } },
    );

    expect(state.stack).toEqual([
      { name: 'modes' },
      games,
      { name: 'item', kind: 'game', itemId: 1, label: 'Zelda' },
    ]);
  });

  it('relabels only the current item screen', () => {
    const item = { name: 'item', kind: 'game', itemId: 1, label: 'Old' } as const;

    expect(
      currentScreen(run({ type: 'open', screen: item }, { type: 'relabel', label: 'New' })),
    ).toEqual({ ...item, label: 'New' });
    expect(run({ type: 'open', screen: games }, { type: 'relabel', label: 'x' }).stack).toEqual([
      { name: 'modes' },
      games,
    ]);
  });

  it('resets to the mode selection screen', () => {
    expect(run({ type: 'open', screen: games }, { type: 'reset' })).toEqual(initialNavigation);
  });
});
