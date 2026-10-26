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

// Platform names are the same in every language except a few generic ones. Grouped by
// manufacturer, home consoles (hybrids included) before handhelds; the app lists them
// alphabetically.
const platforms = (mobile: string, arcade: string): string[] => [
  'PC',
  'macOS',
  'Linux',
  arcade,
  mobile,
  // Magnavox
  'Magnavox Odyssey',
  // Atari
  'Atari Home Pong',
  'Atari 2600',
  'Atari 5200',
  'Atari 7800',
  'Atari Jaguar',
  'Atari Jaguar CD',
  'Atari Lynx',
  // Fairchild
  'Fairchild Channel F',
  // Coleco
  'Coleco Telstar',
  'ColecoVision',
  // Mattel
  'Intellivision',
  // GCE
  'Vectrex',
  // Nintendo
  'NES',
  'Famicom Disk System',
  'SNES',
  'Nintendo 64',
  'Nintendo 64DD',
  'GameCube',
  'iQue Player',
  'Wii',
  'Wii U',
  'Nintendo Switch',
  'Nintendo Switch 2',
  'Game & Watch',
  'Game Boy',
  'Virtual Boy',
  'Game Boy Color',
  'Game Boy Advance',
  'Nintendo DS',
  'Nintendo DSi',
  'Nintendo 3DS',
  // Sega
  'SG-1000',
  'SG-1000 II',
  'Master System',
  'Mega Drive',
  'Mega CD',
  '32X',
  'Saturn',
  'Dreamcast',
  'Game Gear',
  // NEC
  'PC Engine',
  'PC Engine CD-ROM',
  'TurboDuo',
  'PC-FX',
  // SNK
  'Neo Geo',
  'Neo Geo CD',
  'Neo Geo Pocket',
  'Neo Geo Pocket Color',
  // Philips
  'CD-i',
  // 3DO
  '3DO',
  // Capcom
  'CPS Changer',
  // Apple
  'Apple Pippin',
  // Bandai
  'WonderSwan',
  'WonderSwan Color',
  // Sony
  'PlayStation',
  'PlayStation 2',
  'PlayStation 3',
  'PlayStation 4',
  'PlayStation 4 Pro',
  'PlayStation 5',
  'PlayStation 5 Pro',
  'PlayStation Portable',
  'PlayStation Vita',
  // Microsoft
  'Xbox',
  'Xbox 360',
  'Xbox One',
  'Xbox One X',
  'Xbox Series X|S',
  // Nokia
  'N-Gage',
  // Zeebo
  'Zeebo',
  // Google
  'Stadia',
  // Valve
  'Steam Machine',
  'Steam Deck',
];

/**
 * Other names of default platforms (regional names, abbreviations), found when searching.
 * An alias contained in the name or in another alias would add nothing to the search.
 */
export const DEFAULT_PLATFORM_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'Atari 5200': ['Atari 5200 SuperSystem', 'Atari 5200 Advanced Video Entertainment System'],
  'Atari 7800': ['Atari 7800 ProSystem'],
  'Atari Jaguar CD': ['Jag CD'],
  Intellivision: ['Mattel Intellivision'],
  Vectrex: ['GCE Vectrex'],
  NES: ['Nintendo Entertainment System', 'Family Computer', 'Famicom'],
  'Famicom Disk System': ['FDS'],
  SNES: ['Super Nintendo Entertainment System', 'Super Famicom', 'Super FC', 'SFC'],
  'Nintendo 64': ['Ultra 64', 'N64'],
  'Nintendo 64DD': ['Nintendo 64 Disk Drive'],
  GameCube: ['Nintendo GameCube'],
  Wii: ['Nintendo Wii'],
  'Wii U': ['Nintendo Wii U', 'Project Café'],
  'Nintendo Switch': ['NX'],
  'Game & Watch': ['tricOtronic'],
  'Game Boy': ['Nintendo Game Boy', 'GB'],
  'Virtual Boy': ['Nintendo Virtual Boy'],
  'Game Boy Color': ['GBC'],
  'Game Boy Advance': ['GBA'],
  'Nintendo DS': ['NDS'],
  'Nintendo DSi': ['NDSi'],
  'Nintendo 3DS': ['N3DS'],
  'SG-1000': ['Sega SG-1000'],
  'SG-1000 II': ['Sega SG-1000 II'],
  'Master System': ['Sega Mark III', 'Sega Master System'],
  'Mega Drive': ['Sega Genesis', 'Sega Mega Drive'],
  'Mega CD': ['Sega CD'],
  '32X': ['Sega 32X', 'Genesis 32X', 'Super 32X', 'Mega 32X', 'Mega Drive 32X'],
  Saturn: ['Sega Saturn', 'SegaSaturn'],
  Dreamcast: ['Sega Dreamcast'],
  'Game Gear': ['Sega Game Gear'],
  'PC Engine': ['TurboGrafx-16'],
  'PC Engine CD-ROM': ['TurboGrafx-CD'],
  'Neo Geo': ['Neo Geo AES'],
  'CD-i': ['Compact Disc-Interactive'],
  '3DO': ['3DO REAL Interactive Multiplayer', '3DO Interactive Multiplayer'],
  'CPS Changer': ['Capcom Power System Changer'],
  'Apple Pippin': ['PiPP!N'],
  PlayStation: ['PS1', 'PSX', 'Sony PlayStation'],
  'PlayStation 2': ['PS2', 'Sony PlayStation 2'],
  'PlayStation 3': ['PS3', 'Sony PlayStation 3'],
  'PlayStation 4': ['PS4', 'Sony PlayStation 4'],
  'PlayStation 4 Pro': ['PS4 Pro', 'Sony PlayStation 4 Pro'],
  'PlayStation 5': ['PS5', 'Sony PlayStation 5'],
  'PlayStation 5 Pro': ['PS5 Pro', 'Sony PlayStation 5 Pro'],
  'PlayStation Portable': ['PSP', 'Sony PlayStation Portable'],
  'PlayStation Vita': ['PS Vita', 'Sony PlayStation Vita'],
  'N-Gage': ['Nokia N-Gage'],
  Stadia: ['Google Stadia'],
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
