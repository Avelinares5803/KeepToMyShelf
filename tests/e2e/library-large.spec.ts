import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from './launch-app';
import { seedItems, type SeedItem } from './seed-items';

let dataDir: string;
let app: ElectronApplication | undefined;
let page: Page;

const heading = (name: string) => page.getByRole('heading', { name, exact: true });
const button = (name: string) => page.getByRole('button', { name, exact: true });
const cards = () => page.locator('.item-card');

/** What the page evaluates runs in the app's window, which these tests have no types for. */
const scrollTo = (y: number) =>
  page.evaluate((target) => {
    (globalThis as unknown as { scrollTo(x: number, y: number): void }).scrollTo(0, target);
  }, y);
const scrollY = () => page.evaluate(() => (globalThis as unknown as { scrollY: number }).scrollY);
const pageHeight = () =>
  page.evaluate(
    () =>
      (globalThis as unknown as { document: { documentElement: { scrollHeight: number } } })
        .document.documentElement.scrollHeight,
  );

const games = (count: number, make: (index: number) => Partial<SeedItem> = () => ({})) =>
  Array.from({ length: count }, (_, index) => ({
    title: `Juego ${String(index).padStart(5, '0')}`,
    ...make(index),
  }));

/** Opens the games library with the given items. */
async function openGames(items: readonly SeedItem[]): Promise<void> {
  seedItems(dataDir, items);
  await button('Videojuegos').click();
  await expect(heading(`Videojuegos (${items.length})`)).toBeVisible();
  // The rows, and so the height of the page, come right after the count.
  await expect(cards().first()).toBeVisible();
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

test('stays fast with 10,000 items, drawing only what is near the view', async () => {
  await openGames(games(10_000));
  await expect(cards().first()).toBeVisible();
  expect(await cards().count()).toBeLessThan(200);

  // Well below what it took when every card existed: 13.7 s searching, 9.7 s sorting.
  const LIMIT_MS = 3_000;
  const timed = async (run: () => Promise<void>) => {
    const start = performance.now();
    await run();
    expect(performance.now() - start).toBeLessThan(LIMIT_MS);
  };

  await timed(async () => {
    await page.getByRole('searchbox').pressSequentially('juego 01', { delay: 0 });
    await expect(heading('Videojuegos (1000)')).toBeVisible();
  });
  await timed(async () => {
    await page.getByRole('searchbox').fill('');
    await expect(heading('Videojuegos (10000)')).toBeVisible();
  });
  await timed(async () => {
    await button('A-Z').click();
    await expect(page.locator('.item-card__title').first()).toHaveText('Juego 09999');
  });
  await button('Z-A').click();

  // The whole library can be reached, and it never holds many cards.
  await expect(page.locator('.item-card__title').first()).toHaveText('Juego 00000');
  await scrollTo(await pageHeight());
  await expect(button('Juego 09999')).toBeInViewport();
  expect(await cards().count()).toBeLessThan(200);
});

test('tells assistive technology the place of each item in the whole library', async () => {
  await openGames(games(10_000));
  const list = page.getByRole('list', { name: 'Videojuegos', exact: true });

  const first = list.getByRole('listitem').first();
  await expect(first).toHaveAttribute('aria-setsize', '10000');
  await expect(first).toHaveAttribute('aria-posinset', '1');

  await scrollTo(await pageHeight());
  const last = list.getByRole('listitem').filter({ hasText: 'Juego 09999' });
  await expect(last).toHaveAttribute('aria-setsize', '10000');
  await expect(last).toHaveAttribute('aria-posinset', '10000');
});

test('goes beyond the visible part with the keyboard', async () => {
  await openGames(games(500));
  await cards().first().focus();

  for (let index = 0; index < 79; index += 1) {
    await page.keyboard.press('Tab');
  }
  const focused = page.locator('.item-card:focus');
  await expect(focused).toHaveText('Juego 00079');
  await expect(focused).toBeInViewport();

  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.item-card:focus')).toHaveText('Juego 00078');
});

test('keeps the same item in view when the window changes the number of columns', async () => {
  await openGames(games(2_000));
  const firstRowCards = page.locator('.item-grid__row').first().locator('.item-card');
  await expect(firstRowCards.first()).toBeVisible();
  const columnsBefore = await firstRowCards.count();

  await scrollTo((await pageHeight()) / 2);
  await expect.poll(scrollY).toBeGreaterThan(1000);
  // Rows above the view are drawn too: this is the first card really on screen.
  const seen = await cards().evaluateAll((elements) => {
    const shown = elements as unknown as {
      textContent: string;
      getBoundingClientRect(): { top: number };
    }[];
    return shown.find((card) => card.getBoundingClientRect().top >= 0)!.textContent;
  });
  await expect(button(seen)).toBeInViewport();

  // Emulated: the real window has a minimum width at which the columns still do not change.
  await page.setViewportSize({ width: 640, height: 720 });
  await expect.poll(() => firstRowCards.count()).toBeLessThan(columnsBefore);
  await expect(button(seen)).toBeInViewport();
});

test('keeps the width of the cards with and without a scrollbar', async () => {
  // Narrow enough for the scrollbar to take space from the grid. If it did, a page that barely
  // fits would never settle: see the comment in the styles.
  await app!.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.setSize(1024, 720);
  });
  const cardWidth = () =>
    cards()
      .first()
      .evaluate((card) => (card as unknown as { offsetWidth: number }).offsetWidth);

  await openGames(games(1));
  const withoutScrollbar = await cardWidth();
  expect(await pageHeight()).toBeLessThan(1000);

  seedItems(dataDir, games(200));
  await button('Volver').click();
  await button('Videojuegos').click();
  await expect(heading('Videojuegos (201)')).toBeVisible();
  await expect.poll(pageHeight).toBeGreaterThan(1000);
  expect(await cardWidth()).toBe(withoutScrollbar);
});

test('does not jump back while scrolling up through rows of different heights', async () => {
  // Long titles wrap, making rows taller than estimated when they are first drawn.
  await openGames(
    games(1_000, (index) =>
      index % 7 === 0 ? { title: `Juego ${index} ${'con un título muy largo '.repeat(4)}` } : {},
    ),
  );
  await scrollTo(await pageHeight());
  await expect.poll(scrollY).toBeGreaterThan(1000);
  await page.locator('.item-grid').hover();

  let previous = await scrollY();
  for (let step = 0; step < 15; step += 1) {
    await page.mouse.wheel(0, -600);
    await expect.poll(scrollY).toBeLessThan(previous);
    previous = await scrollY();
  }
});
