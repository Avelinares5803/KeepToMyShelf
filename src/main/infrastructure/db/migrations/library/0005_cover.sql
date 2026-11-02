-- The cover becomes its own attribute of the item instead of being the first image of its
-- list: adding, reordering or removing gallery images no longer changes it. The same file
-- can be the cover and also be in the gallery; it is stored once.

-- A cover in use cannot be deleted: unused files are removed by a sweep afterwards.
ALTER TABLE item ADD COLUMN cover_media_id INTEGER REFERENCES media_file (id) ON DELETE RESTRICT;

CREATE INDEX item_cover ON item (cover_media_id);

-- Until now the first image was the cover: it becomes the cover and stays in the gallery.
UPDATE item SET cover_media_id = (
  SELECT im.media_id FROM item_media im JOIN media_file f ON f.id = im.media_id
  WHERE im.item_id = item.id AND f.kind = 'image'
  ORDER BY im.sort_order, f.id
  LIMIT 1
);

-- A CHECK cannot look at another table: these triggers keep the cover an image among the
-- files items use (never a document nor a kept original).
CREATE TRIGGER item_cover_insert BEFORE INSERT ON item
WHEN NEW.cover_media_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM media_file WHERE id = NEW.cover_media_id AND kind = 'image' AND store = 'files'
)
BEGIN
  SELECT RAISE(ABORT, 'item cover must be a stored image');
END;

CREATE TRIGGER item_cover_update BEFORE UPDATE OF cover_media_id ON item
WHEN NEW.cover_media_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM media_file WHERE id = NEW.cover_media_id AND kind = 'image' AND store = 'files'
)
BEGIN
  SELECT RAISE(ABORT, 'item cover must be a stored image');
END;
