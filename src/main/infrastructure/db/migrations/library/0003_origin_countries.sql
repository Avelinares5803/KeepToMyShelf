-- Countries of origin: a new catalog ('country') and a new role ('origin_country').
-- SQLite cannot change a CHECK constraint, so both tables are rebuilt with their rows and
-- ids intact (foreign keys are off while migrations run and are checked before commit).

CREATE TABLE catalog_entry_new (
  id       INTEGER PRIMARY KEY,
  catalog  TEXT NOT NULL CHECK (catalog IN (
    'platform', 'game_genre', 'screen_genre', 'tag', 'region', 'company', 'person', 'franchise',
    'country'
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

INSERT INTO catalog_entry_new (id, catalog, name, name_key, scope)
  SELECT id, catalog, name, name_key, scope FROM catalog_entry;
DROP TABLE catalog_entry;
ALTER TABLE catalog_entry_new RENAME TO catalog_entry;
CREATE INDEX catalog_entry_search ON catalog_entry (catalog, name_key);

CREATE TABLE item_entry_new (
  item_id    INTEGER NOT NULL REFERENCES item (id) ON DELETE CASCADE,
  entry_id   INTEGER NOT NULL REFERENCES catalog_entry (id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN (
    'released_on', 'owned_on', 'genre', 'franchise', 'developer', 'publisher', 'producer',
    'director', 'composer', 'actor', 'tag', 'origin_country'
  )),
  -- Order chosen by the user (e.g. main cast first).
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id, entry_id, role)
) STRICT;

INSERT INTO item_entry_new (item_id, entry_id, role, sort_order)
  SELECT item_id, entry_id, role, sort_order FROM item_entry;
DROP TABLE item_entry;
ALTER TABLE item_entry_new RENAME TO item_entry;
CREATE INDEX item_entry_entry ON item_entry (entry_id);
