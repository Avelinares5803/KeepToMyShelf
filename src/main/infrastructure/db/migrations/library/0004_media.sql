-- Images and PDF documents. A stored file and its use by items are kept apart, so one file
-- can belong to several items without being copied twice.

-- A file stored in the profile's media folder, named by the SHA-256 of its bytes.
-- 'files' holds the files items use; 'originals' holds the originals kept next to an
-- optimized copy. The same bytes may be stored once in each folder, never twice in one.
CREATE TABLE media_file (
  id          INTEGER PRIMARY KEY,
  sha256      TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  store       TEXT NOT NULL CHECK (store IN ('files', 'originals')),
  kind        TEXT NOT NULL CHECK (kind IN ('image', 'document')),
  format      TEXT NOT NULL CHECK (format IN ('jpeg', 'png', 'webp', 'avif', 'gif', 'pdf')),
  byte_size   INTEGER NOT NULL CHECK (byte_size > 0),
  -- Images only, as displayed (EXIF orientation applied).
  width       INTEGER CHECK (width > 0),
  height      INTEGER CHECK (height > 0),
  is_animated INTEGER NOT NULL DEFAULT 0 CHECK (is_animated IN (0, 1)),
  -- Optimized copy → its kept original, to be able to use the original again later.
  original_id INTEGER REFERENCES media_file (id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL,
  UNIQUE (sha256, store),
  CHECK ((kind = 'document') = (format = 'pdf')),
  CHECK ((kind = 'image') = (width IS NOT NULL AND height IS NOT NULL)),
  CHECK (kind = 'image' OR is_animated = 0),
  CHECK (kind = 'image' OR store = 'files'),
  CHECK (store = 'files' OR original_id IS NULL),
  CHECK (original_id IS NULL OR original_id <> id)
) STRICT;

CREATE INDEX media_file_original ON media_file (original_id);

-- The files of each item, in the order chosen by the user. Images and documents are two
-- separate lists; the first image is the cover.
CREATE TABLE item_media (
  item_id    INTEGER NOT NULL REFERENCES item (id) ON DELETE CASCADE,
  -- A file in use cannot be deleted: unused files are removed by a sweep afterwards.
  media_id   INTEGER NOT NULL REFERENCES media_file (id) ON DELETE RESTRICT,
  -- Name shown for a document (the file name at first, editable). NULL for images.
  label      TEXT CHECK (label IS NULL OR length(trim(label)) > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id, media_id)
) STRICT;

CREATE INDEX item_media_media ON item_media (media_id);
