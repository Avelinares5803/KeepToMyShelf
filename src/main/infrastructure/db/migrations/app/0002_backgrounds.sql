-- Backgrounds imported by any profile: one gallery shared by all of them, stored in
-- backgrounds/ next to app.db. Like the media of a profile (library migration 0004), each
-- file is named by the SHA-256 of its bytes.
--
-- 'files' holds the backgrounds of the gallery; 'originals' holds the originals kept next to
-- an optimized copy. The same bytes may be stored once in each folder, never twice in one.
-- Preferences refer to a background by the id of its 'files' row.
CREATE TABLE background_file (
  id          INTEGER PRIMARY KEY,
  sha256      TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  store       TEXT NOT NULL CHECK (store IN ('files', 'originals')),
  format      TEXT NOT NULL CHECK (format IN ('jpeg', 'png', 'webp', 'avif', 'gif')),
  byte_size   INTEGER NOT NULL CHECK (byte_size > 0),
  -- As displayed (EXIF orientation applied).
  width       INTEGER NOT NULL CHECK (width > 0),
  height      INTEGER NOT NULL CHECK (height > 0),
  is_animated INTEGER NOT NULL DEFAULT 0 CHECK (is_animated IN (0, 1)),
  -- Optimized copy → its kept original. A sweep removes originals no copy uses.
  original_id INTEGER REFERENCES background_file (id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL,
  UNIQUE (sha256, store),
  CHECK (store = 'files' OR original_id IS NULL),
  CHECK (original_id IS NULL OR original_id <> id)
) STRICT;

CREATE INDEX background_file_original ON background_file (original_id);
