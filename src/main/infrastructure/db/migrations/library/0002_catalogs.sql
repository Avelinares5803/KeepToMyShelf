-- Reusable values (catalogs) and their links to items. Every catalog lives in one table:
-- platforms, genres, tags, regions, companies, people and franchises behave the same way.

CREATE TABLE catalog_entry (
  id       INTEGER PRIMARY KEY,
  catalog  TEXT NOT NULL CHECK (catalog IN (
    'platform', 'game_genre', 'screen_genre', 'tag', 'region', 'company', 'person', 'franchise'
  )),
  -- Case and accents matter: "Hipo", "Hipó" and "HIPO" are different values.
  name     TEXT NOT NULL CHECK (length(trim(name)) > 0),
  -- Name without case or accents, only used for searching.
  name_key TEXT NOT NULL,
  -- Movie/series genres only: limit a genre to movies or to series. NULL = both.
  scope    TEXT CHECK (scope IN ('movie', 'series')),
  CHECK (scope IS NULL OR catalog = 'screen_genre'),
  UNIQUE (catalog, name)
) STRICT;

CREATE INDEX catalog_entry_search ON catalog_entry (catalog, name_key);

-- Which values an item has, and in which role ("developer", "actor", "owned_on"...).
CREATE TABLE item_entry (
  item_id    INTEGER NOT NULL REFERENCES item (id) ON DELETE CASCADE,
  entry_id   INTEGER NOT NULL REFERENCES catalog_entry (id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN (
    'released_on', 'owned_on', 'genre', 'franchise', 'developer', 'publisher', 'producer',
    'director', 'composer', 'actor', 'tag'
  )),
  -- Order chosen by the user (e.g. main cast first).
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id, entry_id, role)
) STRICT;

CREATE INDEX item_entry_entry ON item_entry (entry_id);

-- Release dates per region. Deleting a region keeps its dates, without a region.
CREATE TABLE item_release (
  id         INTEGER PRIMARY KEY,
  item_id    INTEGER NOT NULL REFERENCES item (id) ON DELETE CASCADE,
  region_id  INTEGER REFERENCES catalog_entry (id) ON DELETE SET NULL,
  date       TEXT NOT NULL CHECK (
    date GLOB '[0-9][0-9][0-9][0-9]'
    OR date GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]'
    OR date GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'
  ),
  sort_order INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE INDEX item_release_item ON item_release (item_id);
CREATE INDEX item_release_region ON item_release (region_id);

-- Internal facts about this library, e.g. whether the default catalogs were loaded.
CREATE TABLE library_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;
