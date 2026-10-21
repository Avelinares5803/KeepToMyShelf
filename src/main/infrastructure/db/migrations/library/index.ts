import type { Migration } from '../../migrator';
import items from './0001_items.sql?raw';

// Append new migrations at the end. Never edit or reorder a migration once it is released.
export const libraryMigrations: readonly Migration[] = [{ version: 1, name: 'items', sql: items }];
