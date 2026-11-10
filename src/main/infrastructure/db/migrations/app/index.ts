import type { Migration } from '../../migrator';
import profiles from './0001_profiles.sql?raw';
import backgrounds from './0002_backgrounds.sql?raw';

// Append new migrations at the end. Never edit or reorder a migration once it is released.
export const appMigrations: readonly Migration[] = [
  { version: 1, name: 'profiles', sql: profiles },
  { version: 2, name: 'backgrounds', sql: backgrounds },
];
