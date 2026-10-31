import type { Migration } from '../../migrator';
import items from './0001_items.sql?raw';
import catalogs from './0002_catalogs.sql?raw';
import originCountries from './0003_origin_countries.sql?raw';
import media from './0004_media.sql?raw';

// Append new migrations at the end. Never edit or reorder a migration once it is released.
export const libraryMigrations: readonly Migration[] = [
  { version: 1, name: 'items', sql: items },
  { version: 2, name: 'catalogs', sql: catalogs },
  { version: 3, name: 'origin countries', sql: originCountries },
  { version: 4, name: 'media', sql: media },
];
