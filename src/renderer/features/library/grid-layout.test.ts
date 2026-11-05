import { describe, expect, it } from 'vitest';
import {
  cardWidthFor,
  columnCountFor,
  estimateRowHeight,
  itemsInRow,
  rowCountFor,
  rowOfItem,
} from './grid-layout';

describe('columnCountFor', () => {
  it('fits as many minimum-width cards as possible, counting the gaps', () => {
    // 5 cards of 160 and 4 gaps of 16 need exactly 864.
    expect(columnCountFor(864, 160, 16)).toBe(5);
    expect(columnCountFor(863, 160, 16)).toBe(4);
    expect(columnCountFor(1024, 160, 16)).toBe(5);
  });

  it('always has one column, even if a card does not fit', () => {
    expect(columnCountFor(100, 160, 16)).toBe(1);
    expect(columnCountFor(0, 160, 16)).toBe(1);
  });
});

describe('cardWidthFor', () => {
  it('shares what the gaps leave', () => {
    expect(cardWidthFor(1024, 5, 16)).toBe(192);
    expect(cardWidthFor(300, 1, 16)).toBe(300);
  });
});

describe('rows', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];

  it('counts a last row that is not full', () => {
    expect(rowCountFor(5, 2)).toBe(3);
    expect(rowCountFor(4, 2)).toBe(2);
    expect(rowCountFor(0, 2)).toBe(0);
  });

  it('splits the items into rows', () => {
    expect(itemsInRow(items, 0, 2)).toEqual(['a', 'b']);
    expect(itemsInRow(items, 2, 2)).toEqual(['e']);
    expect(itemsInRow(items, 3, 2)).toEqual([]);
  });

  it('finds the row of an item', () => {
    expect(rowOfItem(0, 2)).toBe(0);
    expect(rowOfItem(1, 2)).toBe(0);
    expect(rowOfItem(4, 2)).toBe(2);
  });
});

describe('estimateRowHeight', () => {
  const metrics = { cardWidth: 200, plainCardHeight: 112, titleHeight: 28, rowGap: 24 };

  it('uses the card height when no card has a cover', () => {
    expect(estimateRowHeight([{ cover: null }, { cover: null }], metrics)).toBe(136);
  });

  it('follows the tallest cover, keeping its proportions', () => {
    const row = [
      { cover: { width: 300, height: 300 } },
      { cover: { width: 300, height: 900 } },
      { cover: null },
    ];
    expect(estimateRowHeight(row, metrics)).toBe(600 + 28 + 24);
  });

  it('never goes below a card without a cover', () => {
    expect(estimateRowHeight([{ cover: { width: 1000, height: 100 } }], metrics)).toBe(136);
  });
});
