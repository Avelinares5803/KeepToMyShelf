import { useState, type CSSProperties } from 'react';

interface AppBackgroundProps {
  /** The picture to show, or null for no background. */
  src: string | null;
  /** Blur, in CSS pixels. */
  blur: number;
}

/**
 * The background behind the whole UI: a fixed picture that covers the window, blurred, under
 * a veil of the theme's colour so text stays readable on any picture. A picture that cannot
 * be loaded (e.g. its file was deleted by hand) shows no background, as if none was chosen.
 *
 * Known limitation: the space the library keeps for its scrollbar (`scrollbar-gutter`) keeps
 * the theme's colour, because Chromium never paints fixed elements nor <html> there.
 */
export function AppBackground({ src, blur }: AppBackgroundProps) {
  const [failed, setFailed] = useState<string | null>(null);
  if (src === null || src === failed) return null;

  return (
    <div
      className="app-background"
      aria-hidden="true"
      style={{ '--background-blur': `${blur}px` } as CSSProperties}
    >
      <img className="app-background__image" src={src} alt="" onError={() => setFailed(src)} />
      <div className="app-background__veil" />
    </div>
  );
}
