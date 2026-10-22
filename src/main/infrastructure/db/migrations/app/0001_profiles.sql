-- Profile registry. Each profile's library lives in its own database file
-- (profiles/<id>/library.db), so profile data can never be mixed.

CREATE TABLE profile (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL CHECK (length(trim(name)) > 0),
  -- Normalized name (no case, accents or extra spaces): "Adrián" and "adrian" cannot coexist.
  name_key       TEXT NOT NULL UNIQUE,
  created_at     TEXT NOT NULL,
  last_opened_at TEXT
) STRICT;

-- Preferences resolve as: profile value → global value → built-in default.
-- Keys are validated in code, so new preferences need no schema change.
CREATE TABLE app_setting (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

CREATE TABLE profile_setting (
  profile_id TEXT NOT NULL REFERENCES profile (id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  PRIMARY KEY (profile_id, key)
) STRICT;
