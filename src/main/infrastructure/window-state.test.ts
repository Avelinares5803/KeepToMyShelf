import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isOnScreen,
  loadWindowState,
  sameRectangle,
  saveWindowState,
  type WindowState,
} from './window-state';

const STATE: WindowState = {
  bounds: { x: 100, y: 80, width: 1400, height: 900 },
  maximized: true,
  fullScreen: false,
};

describe('loadWindowState and saveWindowState', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ktms-window-ñá-'));
    file = join(dir, 'window-state.json');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it('has no state before the first save', () => {
    expect(loadWindowState(file)).toBeNull();
  });

  it('reads back what it saved, leaving no temporary file', () => {
    saveWindowState(file, STATE);
    saveWindowState(file, { ...STATE, fullScreen: true });
    expect(loadWindowState(file)).toEqual({ ...STATE, fullScreen: true });
    expect(readdirSync(dir)).toEqual(['window-state.json']);
  });

  it('ignores a file that is not JSON', () => {
    writeFileSync(file, '{ broken');
    expect(loadWindowState(file)).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it.each([
    ['a missing field', { bounds: STATE.bounds, maximized: true }],
    ['a size of zero', { ...STATE, bounds: { ...STATE.bounds, width: 0 } }],
    ['a position that is not a number', { ...STATE, bounds: { ...STATE.bounds, x: 'left' } }],
    ['a list', [STATE]],
  ])('ignores a state with %s', (_case, content) => {
    writeFileSync(file, JSON.stringify(content));
    expect(loadWindowState(file)).toBeNull();
  });

  it('reports other read errors', () => {
    // A folder where the file should be.
    expect(existsSync(dir)).toBe(true);
    expect(() => loadWindowState(dir)).toThrow();
  });
});

describe('sameRectangle', () => {
  it('compares position and size', () => {
    const a = { x: 1, y: 2, width: 3, height: 4 };
    expect(sameRectangle(a, { ...a })).toBe(true);
    expect(sameRectangle(a, { ...a, height: 5 })).toBe(false);
    expect(sameRectangle(a, { ...a, x: 0 })).toBe(false);
  });
});

describe('isOnScreen', () => {
  const primary = { x: 0, y: 0, width: 1920, height: 1040 };
  const right = { x: 1920, y: 0, width: 2560, height: 1400 };

  it('accepts a window inside a screen', () => {
    expect(isOnScreen({ x: 100, y: 100, width: 1280, height: 800 }, [primary])).toBe(true);
  });

  it('accepts a window on a second screen while it is connected', () => {
    const bounds = { x: 2200, y: 50, width: 1280, height: 800 };
    expect(isOnScreen(bounds, [primary, right])).toBe(true);
    expect(isOnScreen(bounds, [primary])).toBe(false);
  });

  it('accepts a window partly off screen if its title bar can still be grabbed', () => {
    expect(isOnScreen({ x: -1100, y: 200, width: 1280, height: 800 }, [primary])).toBe(true);
  });

  it('rejects a window with too little of its title bar on screen', () => {
    expect(isOnScreen({ x: -1200, y: 200, width: 1280, height: 800 }, [primary])).toBe(false);
  });

  it('rejects a window whose title bar is above or below the screens', () => {
    expect(isOnScreen({ x: 100, y: -300, width: 1280, height: 800 }, [primary])).toBe(false);
    expect(isOnScreen({ x: 100, y: 1020, width: 1280, height: 800 }, [primary])).toBe(false);
  });
});
