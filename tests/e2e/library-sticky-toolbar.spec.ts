import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { launchApp } from './launch-app';
import { scrollAreaTo, scrollHeight, scrollTop } from './scroll-area';
import { seedCollections, seedItems } from './seed-items';

let dataDir: string;
let app: ElectronApplication | undefined;
let page: Page;

const heading = (name: string) => page.getByRole('heading', { name, exact: true });
const button = (name: string) => page.getByRole('button', { name, exact: true });
const cards = () => page.locator('.item-card');
const toolbar = () => page.locator('.library__toolbar');
const area = () => page.locator('#app-scroll');

const scrollY = () => scrollTop(page);

const games = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    title: `Juego ${String(index).padStart(5, '0')}`,
  }));

async function box(locator: Locator): Promise<{ top: number; bottom: number }> {
  const found = await locator.boundingBox();
  if (found === null) throw new Error('Not on screen');
  return { top: found.y, bottom: found.y + found.height };
}

/** The toolbar is stuck to the top of the scrolling area, under the top bar. */
async function expectToolbarAtTop(): Promise<void> {
  await expect.poll(async () => (await box(toolbar())).top).toBe((await box(area())).top);
  await expect(page.getByRole('searchbox')).toBeInViewport();
}

/** Nothing of the element is hidden under the toolbar. */
async function expectBelowToolbar(locator: Locator): Promise<void> {
  await expect(locator).toBeInViewport();
  const toolbarBottom = (await box(toolbar())).bottom;
  expect((await box(locator)).top).toBeGreaterThanOrEqual(toolbarBottom - 0.5);
}

/**
 * The first card that shows whole below the toolbar. Rows above the view are drawn too, so it
 * is not the first card drawn. What runs in the page has no DOM types here.
 */
const firstBelowToolbar = (): Promise<string | null> =>
  cards().evaluateAll((elements) => {
    type Element = {
      getBoundingClientRect(): { top: number; bottom: number };
      querySelector(selector: string): { textContent: string } | null;
    };
    const bar = (
      globalThis as unknown as { document: { querySelector(selector: string): Element } }
    ).document.querySelector('.library__toolbar');
    const barBottom = bar.getBoundingClientRect().bottom;
    const shown = elements as unknown as Element[];
    const first = shown.find((card) => card.getBoundingClientRect().top >= barBottom - 0.5);
    return first?.querySelector('.item-card__title')?.textContent ?? null;
  });

/** The card of an item, found by its title (in a collection, its kind is in its name too). */
const card = (title: string) => cards().filter({ hasText: title });

/**
 * Scrolls to the middle of the grid and returns the first card below the toolbar. The rows of
 * the new place are drawn just after scrolling, so it is waited for.
 */
async function scrollToMiddle(): Promise<string> {
  await scrollAreaTo(page, (await scrollHeight(page)) / 2);
  await expect.poll(scrollY).toBeGreaterThan(1000);
  await expectToolbarAtTop();
  await expect.poll(firstBelowToolbar).not.toBeNull();
  return (await firstBelowToolbar())!;
}

/**
 * Scrolls to the middle and then a bit further, so that the returned card is partly hidden
 * under the toolbar: it is the first card of the row cut by the toolbar's bottom edge.
 */
async function scrollUnderToolbar(): Promise<string> {
  const title = await scrollToMiddle();
  const hidden = 10;
  const by = (await box(card(title))).top - (await box(toolbar())).bottom + hidden;
  await scrollAreaTo(page, (await scrollY()) + by);
  // Within a pixel: positions have fractions of a pixel.
  const hiddenNow = async () => (await box(toolbar())).bottom - (await box(card(title))).top;
  await expect.poll(async () => Math.abs((await hiddenNow()) - hidden)).toBeLessThan(1);
  return title;
}

/**
 * Opens the item and comes back: the row cut by the toolbar is placed whole right below it,
 * not under it, and not one row lower (which happens if the row noted is the one hidden under
 * the toolbar).
 */
async function expectReturnBelowToolbar(title: string): Promise<void> {
  await card(title).click();
  await expect(heading(title)).toBeVisible();
  await button('Volver').click();

  await expectToolbarAtTop();
  await expectBelowToolbar(card(title));
  expect(await firstBelowToolbar()).toBe(title);
}

test.beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'ktms-e2e-ñáü-'));
  ({ app, page } = await launchApp(dataDir));
  await button('Español').click();
  await page.getByLabel('Nombre').fill('Ana');
  await button('Crear perfil').click();
  await button('Abrir el perfil de Ana').click();
  await expect(button('Videojuegos')).toBeVisible();
});

test.afterEach(async () => {
  await app?.close();
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

async function openGames(count: number): Promise<void> {
  seedItems(dataDir, games(count));
  await button('Videojuegos').click();
  await expect(heading(`Videojuegos (${count})`)).toBeVisible();
  await expect(cards().first()).toBeVisible();
}

test('keeps the toolbar in view and returns to the item below it', async () => {
  await openGames(500);
  await expectReturnBelowToolbar(await scrollUnderToolbar());
});

test('keeps the toolbar in view in a collection, and returns to the item below it', async () => {
  seedItems(dataDir, games(300));
  seedCollections(dataDir, [{ name: 'Favoritos', items: games(300).map(({ title }) => title) }]);
  await button('Colecciones').click();
  await button('Favoritos 300 elementos').click();
  await expect(cards().first()).toBeVisible();
  await expectReturnBelowToolbar(await scrollUnderToolbar());
});

test('does not hide under the toolbar the card reached going back with the keyboard', async () => {
  await openGames(500);
  await card(await scrollToMiddle()).focus();

  // A whole row back, and a few more: those cards were above the toolbar or under it.
  for (let step = 0; step < 12; step += 1) {
    await page.keyboard.press('Shift+Tab');
    await expectBelowToolbar(page.locator('.item-card:focus'));
  }
});

test('brings the filters into view when opened from the toolbar at the top', async () => {
  await openGames(500);
  await scrollToMiddle();

  await button('Filtros').click();
  const panel = page.locator('.filters-panel');
  await expectBelowToolbar(panel);
  await expectToolbarAtTop();

  // The panel does not stay at the top: it scrolls away with the cards.
  await scrollAreaTo(page, (await scrollHeight(page)) / 2);
  await expect(panel).not.toBeInViewport();
  await expectToolbarAtTop();

  // Closing them does not move the cards in view (the browser keeps them in place).
  await expect.poll(firstBelowToolbar).not.toBeNull();
  const before = await firstBelowToolbar();
  await button('Filtros').click();
  await expect(panel).toBeHidden();
  expect(await firstBelowToolbar()).toBe(before);
});

test('does not scroll when a control of the toolbar at the top gets the focus', async () => {
  await openGames(500);
  await scrollToMiddle();
  const before = await scrollY();

  await page.getByRole('searchbox').focus();
  await page.keyboard.press('Tab');
  await expect(button('Filtros')).toBeFocused();
  expect(await scrollY()).toBe(before);
});
