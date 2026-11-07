-- Collections: lists of items chosen by hand, of any kind. They hold references to items,
-- never copies: an item in the trash is hidden from its collections and comes back when
-- restored, and deleting it for good removes it from them.

CREATE TABLE collection (
  id             INTEGER PRIMARY KEY,
  uuid           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL CHECK (length(trim(name)) > 0),
  -- The name ignoring case and accents: two collections cannot differ only in that.
  name_key       TEXT NOT NULL UNIQUE,
  -- A cover in use cannot be deleted: unused files are removed by a sweep afterwards.
  cover_media_id INTEGER REFERENCES media_file (id) ON DELETE RESTRICT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
) STRICT;

CREATE INDEX collection_cover ON collection (cover_media_id);

CREATE TABLE collection_item (
  collection_id INTEGER NOT NULL REFERENCES collection (id) ON DELETE CASCADE,
  item_id       INTEGER NOT NULL REFERENCES item (id) ON DELETE CASCADE,
  -- Not used yet; kept because it could not be recovered later.
  added_at      TEXT NOT NULL,
  PRIMARY KEY (collection_id, item_id)
) STRICT;

-- The collections of an item (its detail view) are found by the item.
CREATE INDEX collection_item_item ON collection_item (item_id);

-- Like an item's cover, a collection's cover is a stored image among the files items use
-- (never a document nor a kept original). A CHECK cannot look at another table.
CREATE TRIGGER collection_cover_insert BEFORE INSERT ON collection
WHEN NEW.cover_media_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM media_file WHERE id = NEW.cover_media_id AND kind = 'image' AND store = 'files'
)
BEGIN
  SELECT RAISE(ABORT, 'collection cover must be a stored image');
END;

CREATE TRIGGER collection_cover_update BEFORE UPDATE OF cover_media_id ON collection
WHEN NEW.cover_media_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM media_file WHERE id = NEW.cover_media_id AND kind = 'image' AND store = 'files'
)
BEGIN
  SELECT RAISE(ABORT, 'collection cover must be a stored image');
END;
