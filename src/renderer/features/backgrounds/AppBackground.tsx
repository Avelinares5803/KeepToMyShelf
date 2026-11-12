import { useState, type CSSProperties } from 'react';

interface AppBackgroundProps {
  /** The picture to show, or null for no background. */
  src: string | null;
  /** Blur, in CSS pixels. */
  blur: number;
  /** How much of the theme's colour veils the picture, in percent. */
  dim: number;
}

/**
 * The background behind the whole UI: a fixed picture that covers the window, blurred, under
 * a veil of the theme's colour so text stays readable on any picture. A picture that cannot
 * be loaded (e.g. its file was deleted by hand) shows no background, as if none was chosen.
 * The window never scrolls (see lib/scroll-area), so the picture always covers all of it, and
 * the scrollbar of the area that scrolls is drawn over it.
 */
export function AppBackground({ src, blur, dim }: AppBackgroundProps) {
  const [failed, setFailed] = useState<string | null>(null);
  if (src === null || src === failed) return null;

  return (
    <div
      className="app-background"
      aria-hidden="true"
      style={{ '--background-blur': `${blur}px`, '--background-dim': `${dim}%` } as CSSProperties}
    >
      <img className="app-background__image" src={src} alt="" onError={() => setFailed(src)} />
      <div className="app-background__veil" />
    </div>
  );
}
