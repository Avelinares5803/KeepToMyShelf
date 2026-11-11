/**
 * What scrolls is the area under the top bar (see App), not the window: the gutter of an
 * element's scrollbar is transparent, so the background shows under the scrollbar, and the
 * top bar always stays in view. The window's own gutter would be a strip of the theme's
 * colour that also narrows the background.
 */
export const SCROLL_AREA_ID = 'app-scroll';

/** The scrolling area; null only before the app has rendered it. */
export function scrollArea(): HTMLElement | null {
  return document.getElementById(SCROLL_AREA_ID);
}

/** New results start from the top. */
export function scrollToTop(): void {
  scrollArea()?.scrollTo(0, 0);
}
