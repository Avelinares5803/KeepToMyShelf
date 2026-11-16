import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { z } from 'zod';

export interface Rectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** How the main window was left when the app closed, to open it the same way next time. */
export interface WindowState {
  /** Position and size of the window when it is neither maximized nor full screen. */
  readonly bounds: Rectangle;
  readonly maximized: boolean;
  readonly fullScreen: boolean;
}

const rectangleSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const windowStateSchema = z.object({
  bounds: rectangleSchema,
  maximized: z.boolean(),
  fullScreen: z.boolean(),
});

/**
 * The saved state, or null if there is none yet or the file cannot be used (edited by hand,
 * written by a newer version...). The window then opens at its default size: nothing is lost.
 */
export function loadWindowState(file: string): WindowState | null {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    console.warn(`Ignoring ${file}: it is not valid JSON.`);
    return null;
  }
  const parsed = windowStateSchema.safeParse(json);
  if (!parsed.success) {
    console.warn(`Ignoring ${file}: unexpected content.`);
    return null;
  }
  return parsed.data;
}

/** Written to a temporary file first, so a crash never leaves a half-written state. */
export function saveWindowState(file: string, state: WindowState): void {
  const partial = `${file}.partial`;
  writeFileSync(partial, JSON.stringify(state, null, 2));
  renameSync(partial, file);
}

export function sameRectangle(a: Rectangle, b: Rectangle): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** How much of the window's top edge must be on a screen to be able to grab and move it. */
const MIN_VISIBLE_WIDTH = 100;
const MIN_VISIBLE_HEIGHT = 40;

/**
 * Whether the window's title bar is on one of the screens' work areas. A window saved on a
 * monitor that has been unplugged, or with a resolution that has shrunk, would open out of sight.
 */
export function isOnScreen(bounds: Rectangle, workAreas: readonly Rectangle[]): boolean {
  const titleBar: Rectangle = { ...bounds, height: Math.min(bounds.height, MIN_VISIBLE_HEIGHT) };
  return workAreas.some((area) => {
    const width =
      Math.min(titleBar.x + titleBar.width, area.x + area.width) - Math.max(titleBar.x, area.x);
    const height =
      Math.min(titleBar.y + titleBar.height, area.y + area.height) - Math.max(titleBar.y, area.y);
    return width >= MIN_VISIBLE_WIDTH && height >= titleBar.height;
  });
}
