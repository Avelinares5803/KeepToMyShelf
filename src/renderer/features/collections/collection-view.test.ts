import { describe, expect, it } from 'vitest';
import {
  collectionViewOf,
  INITIAL_COLLECTION_VIEW,
  withCollectionView,
  withoutCollectionView,
} from './collection-view';

describe('collection views', () => {
  it('start showing every kind, in title order, from the top', () => {
    expect(collectionViewOf({}, 1)).toEqual({
      search: '',
      sort: { field: 'title', direction: 'asc' },
      kind: null,
      anchor: null,
    });
  });

  it('are kept apart for each collection', () => {
    const views = withCollectionView({}, 1, { kind: 'movie', search: 'alien' });

    expect(collectionViewOf(views, 1)).toEqual({
      ...INITIAL_COLLECTION_VIEW,
      kind: 'movie',
      search: 'alien',
    });
    expect(collectionViewOf(views, 2)).toEqual(INITIAL_COLLECTION_VIEW);
  });

  it('keep what did not change', () => {
    const views = withCollectionView(withCollectionView({}, 1, { kind: 'game' }), 1, {
      search: 'zelda',
    });

    expect(collectionViewOf(views, 1)).toMatchObject({ kind: 'game', search: 'zelda' });
  });

  it('are forgotten when the collection is deleted', () => {
    const views = withCollectionView(withCollectionView({}, 1, { kind: 'game' }), 2, {
      kind: 'series',
    });

    const left = withoutCollectionView(views, 1);

    expect(collectionViewOf(left, 1)).toEqual(INITIAL_COLLECTION_VIEW);
    expect(collectionViewOf(left, 2).kind).toBe('series');
  });
});
