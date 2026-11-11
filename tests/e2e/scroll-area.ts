import type { Page } from '@playwright/test';

/**
 * The app scrolls the area under the top bar, not the window (src/renderer/lib/scroll-area).
 * What runs in the page has no DOM types here, so the element is described by what is used.
 */
interface Scrollable {
  scrollTop: number;
  readonly scrollHeight: number;
}

const area = (page: Page) => page.locator('#app-scroll');

export const scrollTop = (page: Page): Promise<number> =>
  area(page).evaluate((element) => (element as unknown as Scrollable).scrollTop);

export const scrollHeight = (page: Page): Promise<number> =>
  area(page).evaluate((element) => (element as unknown as Scrollable).scrollHeight);

export const scrollAreaTo = (page: Page, y: number): Promise<void> =>
  area(page).evaluate((element, target) => {
    (element as unknown as Scrollable).scrollTop = target;
  }, y);
