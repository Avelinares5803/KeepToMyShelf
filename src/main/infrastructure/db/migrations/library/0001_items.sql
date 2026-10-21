-- Items of every kind (games, movies, series) share one table: they have the same scalar
-- attributes. Kind-specific data lives in separate tables (series_details).

CREATE TABLE item (
  id             INTEGER PRIMARY KEY,
  uuid           TEXT NOT NULL UNIQUE,
  kind           TEXT NOT NULL CHECK (kind IN ('game', 'movie', 'series')),
  -- Either a real title or a placeholder number ("Untitled 3"), never both nor neither.
  title          TEXT CHECK (title IS NULL OR length(trim(title)) > 0),
  title_norm     TEXT,
  placeholder_no INTEGER CHECK (placeholder_no > 0),
  description    TEXT,
  notes          TEXT,
  is_favorite    INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  -- Half stars: 1 = 0.5 stars ... 10 = 5 stars. NULL = not rated.
  rating         INTEGER CHECK (rating BETWEEN 1 AND 10),
  status         TEXT CHECK (status IN ('not_started', 'in_progress', 'completed', 'abandoned')),
  is_replay      INTEGER NOT NULL DEFAULT 0 CHECK (is_replay IN (0, 1)),
  owns_physical  INTEGER NOT NULL DEFAULT 0 CHECK (owns_physical IN (0, 1)),
  owns_digital   INTEGER NOT NULL DEFAULT 0 CHECK (owns_digital IN (0, 1)),
  -- Partial date ("2021", "2021-03", "2021-03-14") or 'unknown'. Semantic rules live in core/dates.
  started_on     TEXT CHECK (
    started_on IS NULL
    OR started_on = 'unknown'
    OR started_on GLOB '[0-9][0-9][0-9][0-9]'
    OR started_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]'
    OR started_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'
  ),
  finished_on    TEXT CHECK (
    finished_on IS NULL
    OR finished_on = 'unknown'
    OR finished_on GLOB '[0-9][0-9][0-9][0-9]'
    OR finished_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]'
    OR finished_on GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'
  ),
  minutes_played INTEGER CHECK (minutes_played >= 0),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  -- Trash: NULL = not in the trash.
  deleted_at     TEXT,
  CHECK ((title IS NULL) = (placeholder_no IS NOT NULL)),
  CHECK ((title IS NULL) = (title_norm IS NULL)),
  CHECK (kind = 'game' OR minutes_played IS NULL)
) STRICT;

-- Placeholder numbers are unique per kind, including items in the trash.
CREATE UNIQUE INDEX item_placeholder_unique ON item (kind, placeholder_no)
  WHERE placeholder_no IS NOT NULL;

CREATE INDEX item_library ON item (kind, deleted_at, title_norm);

CREATE TABLE series_details (
  item_id        INTEGER PRIMARY KEY REFERENCES item (id) ON DELETE CASCADE,
  seasons_count  INTEGER CHECK (seasons_count >= 0),
  episodes_count INTEGER CHECK (episodes_count >= 0)
) STRICT;

CREATE TABLE item_alt_title (
  id         INTEGER PRIMARY KEY,
  item_id    INTEGER NOT NULL REFERENCES item (id) ON DELETE CASCADE,
  title      TEXT NOT NULL CHECK (length(trim(title)) > 0),
  title_norm TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE INDEX item_alt_title_item ON item_alt_title (item_id);
