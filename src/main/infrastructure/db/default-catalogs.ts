import type { GenreScope } from '../../../core/catalogs/catalogs';
import { normalizeForSearch } from '../../../core/text/normalize';
import type { Language } from '../../../shared/settings';
import type { SqliteDatabase } from './connection';

interface DefaultEntry {
  readonly name: string;
  readonly scope?: GenreScope;
}

interface DefaultCatalogs {
  readonly platform: readonly string[];
  readonly game_genre: readonly string[];
  readonly screen_genre: readonly DefaultEntry[];
  readonly region: readonly string[];
}

// Platform names are the same in every language except a few generic ones.
const platforms = (mobile: string, arcade: string): string[] => [
  'PC',
  'macOS',
  'Linux',
  'PlayStation',
  'PlayStation 2',
  'PlayStation 3',
  'PlayStation 4',
  'PlayStation 5',
  'PSP',
  'PS Vita',
  'Xbox',
  'Xbox 360',
  'Xbox One',
  'Xbox Series X|S',
  'NES',
  'Super Nintendo',
  'Nintendo 64',
  'GameCube',
  'Wii',
  'Wii U',
  'Nintendo Switch',
  'Nintendo Switch 2',
  'Game Boy',
  'Game Boy Color',
  'Game Boy Advance',
  'Nintendo DS',
  'Nintendo 3DS',
  'Master System',
  'Mega Drive',
  'Sega Saturn',
  'Dreamcast',
  'Game Gear',
  'Atari 2600',
  'Neo Geo',
  mobile,
  arcade,
];

/** Other names of default platforms, mostly regional (found when searching). */
export const DEFAULT_PLATFORM_ALIASES: Readonly<Record<string, readonly string[]>> = {
  NES: ['Famicom'],
  'Super Nintendo': ['Super Famicom', 'SNES'],
  'Mega Drive': ['Genesis'],
  'Xbox Series X|S': ['Xbox Series'],
};

/** Initial lists copied into every new profile, in the profile's language. */
export const DEFAULT_CATALOGS: Record<Language, DefaultCatalogs> = {
  es: {
    platform: platforms('Móvil', 'Arcade'),
    game_genre: [
      'Acción',
      'Aventura',
      'Acción-aventura',
      'RPG',
      'Rol de acción',
      'JRPG',
      'Estrategia',
      'Táctico',
      'Plataformas',
      'Disparos',
      'Lucha',
      "Beat 'em up",
      'Carreras',
      'Deportes',
      'Puzle',
      'Simulación',
      'Terror',
      'Sigilo',
      'Metroidvania',
      'Roguelike',
      'Mundo abierto',
      'Ritmo',
      'Musical',
      'Novela visual',
      'Party',
      'Sandbox',
    ],
    screen_genre: [
      { name: 'Acción' },
      { name: 'Aventura' },
      { name: 'Animación' },
      { name: 'Biografía' },
      { name: 'Ciencia ficción' },
      { name: 'Comedia' },
      { name: 'Crimen' },
      { name: 'Documental' },
      { name: 'Drama' },
      { name: 'Familiar' },
      { name: 'Fantasía' },
      { name: 'Guerra' },
      { name: 'Historia' },
      { name: 'Misterio' },
      { name: 'Musical' },
      { name: 'Romance' },
      { name: 'Superhéroes' },
      { name: 'Suspense' },
      { name: 'Terror' },
      { name: 'Western' },
      { name: 'Cortometraje', scope: 'movie' },
      { name: 'Sitcom', scope: 'series' },
      { name: 'Telenovela', scope: 'series' },
      { name: 'Reality', scope: 'series' },
      { name: 'Docuserie', scope: 'series' },
    ],
    region: [
      'Japón',
      'Norteamérica',
      'Europa',
      'España',
      'Reino Unido',
      'Latinoamérica',
      'Corea del Sur',
      'China',
      'Australia',
      'Mundial',
    ],
  },
  en: {
    platform: platforms('Mobile', 'Arcade'),
    game_genre: [
      'Action',
      'Adventure',
      'Action-adventure',
      'RPG',
      'Action RPG',
      'JRPG',
      'Strategy',
      'Tactics',
      'Platformer',
      'Shooter',
      'Fighting',
      "Beat 'em up",
      'Racing',
      'Sports',
      'Puzzle',
      'Simulation',
      'Horror',
      'Stealth',
      'Metroidvania',
      'Roguelike',
      'Open world',
      'Rhythm',
      'Music',
      'Visual novel',
      'Party',
      'Sandbox',
    ],
    screen_genre: [
      { name: 'Action' },
      { name: 'Adventure' },
      { name: 'Animation' },
      { name: 'Biography' },
      { name: 'Science fiction' },
      { name: 'Comedy' },
      { name: 'Crime' },
      { name: 'Documentary' },
      { name: 'Drama' },
      { name: 'Family' },
      { name: 'Fantasy' },
      { name: 'War' },
      { name: 'History' },
      { name: 'Mystery' },
      { name: 'Musical' },
      { name: 'Romance' },
      { name: 'Superhero' },
      { name: 'Thriller' },
      { name: 'Horror' },
      { name: 'Western' },
      { name: 'Short film', scope: 'movie' },
      { name: 'Sitcom', scope: 'series' },
      { name: 'Soap opera', scope: 'series' },
      { name: 'Reality', scope: 'series' },
      { name: 'Docuseries', scope: 'series' },
    ],
    region: [
      'Japan',
      'North America',
      'Europe',
      'Spain',
      'United Kingdom',
      'Latin America',
      'South Korea',
      'China',
      'Australia',
      'Worldwide',
    ],
  },
};

const SEEDED_FLAG = 'default_catalogs_seeded';

/**
 * Copies the default catalogs into a library, once. Afterwards they are ordinary values the
 * user can edit or delete; they are never translated or re-created.
 */
export function seedDefaultCatalogs(db: SqliteDatabase, language: Language): void {
  db.transaction(() => {
    if (db.prepare('SELECT 1 FROM library_meta WHERE key = ?').get(SEEDED_FLAG)) return;

    const insert = db.prepare(
      'INSERT OR IGNORE INTO catalog_entry (catalog, name, name_key, scope) VALUES (?, ?, ?, ?)',
    );
    const insertAlias = db.prepare(
      'INSERT INTO catalog_entry_alias (entry_id, name, name_key) VALUES (?, ?, ?)',
    );
    const lists = DEFAULT_CATALOGS[language];
    for (const name of lists.platform) {
      const { changes, lastInsertRowid } = insert.run(
        'platform',
        name,
        normalizeForSearch(name),
        null,
      );
      // An ignored (already existing) row leaves lastInsertRowid pointing at another value.
      if (changes === 0) continue;
      for (const alias of DEFAULT_PLATFORM_ALIASES[name] ?? []) {
        insertAlias.run(Number(lastInsertRowid), alias, normalizeForSearch(alias));
      }
    }
    for (const name of lists.game_genre) {
      insert.run('game_genre', name, normalizeForSearch(name), null);
    }
    for (const { name, scope } of lists.screen_genre) {
      insert.run('screen_genre', name, normalizeForSearch(name), scope ?? null);
    }
    for (const name of lists.region) insert.run('region', name, normalizeForSearch(name), null);

    db.prepare('INSERT INTO library_meta (key, value) VALUES (?, ?)').run(
      SEEDED_FLAG,
      new Date().toISOString(),
    );
  })();
}
