import { useRef, useState, type DragEvent } from 'react';

interface DropZoneProps {
  onDragEnter: (event: DragEvent) => void;
  onDragOver: (event: DragEvent) => void;
  onDragLeave: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
}

/**
 * Makes an element a place to drop files from the file explorer. `onDrop` gets the dropped
 * `File` objects (none when what was dropped is not a file, e.g. a link from a web browser).
 * While `enabled` is false (e.g. an import is already under way) the zone does not react and,
 * as anywhere else in the window, a drop does nothing (see `preventDropsOutsideZones`).
 *
 * `over` is true while something is dragged over the zone, to highlight it.
 */
export function useFileDrop({
  enabled,
  onDrop,
}: {
  enabled: boolean;
  onDrop: (files: File[]) => void;
}): { over: boolean; zoneProps: DropZoneProps | Record<string, never> } {
  const [over, setOver] = useState(false);
  // dragenter and dragleave also fire when the pointer crosses the zone's children: the zone
  // is left only when every enter has had its leave.
  const depth = useRef(0);

  if (!enabled) return { over: false, zoneProps: {} };

  // Cancelling dragover is what allows a drop here; it also tells the window-wide handler
  // that a zone took care of it.
  const accept = (event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };
  return {
    over,
    zoneProps: {
      onDragEnter: (event) => {
        accept(event);
        depth.current += 1;
        setOver(true);
      },
      onDragOver: accept,
      onDragLeave: () => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      },
      onDrop: (event) => {
        event.preventDefault();
        depth.current = 0;
        setOver(false);
        onDrop([...event.dataTransfer.files]);
      },
    },
  };
}

/**
 * Outside a drop zone, dropping a file must do nothing. By default Chromium would open the
 * file as a page (the main process blocks that navigation anyway); this shows the "not
 * allowed" cursor instead, and no drop happens. Zones cancel dragover first, so they are left
 * alone. Called once, when the UI starts.
 */
export function preventDropsOutsideZones(target: Window): void {
  target.addEventListener('dragover', (event) => {
    if (event.defaultPrevented) return;
    event.preventDefault();
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'none';
  });
  target.addEventListener('drop', (event) => event.preventDefault());
}
