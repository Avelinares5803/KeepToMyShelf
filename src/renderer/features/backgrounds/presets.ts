import type { ImportedBackground } from '../../../shared/backgrounds';
import type { BackgroundChoice, BackgroundPreset } from '../../../shared/settings';
import aurora from '../../assets/backgrounds/aurora.svg';
import dusk from '../../assets/backgrounds/dusk.svg';
import ember from '../../assets/backgrounds/ember.svg';
import forest from '../../assets/backgrounds/forest.svg';
import nebula from '../../assets/backgrounds/nebula.svg';
import ocean from '../../assets/backgrounds/ocean.svg';
import { backgroundImageSource } from '../../lib/media-url';

/** The pictures of the backgrounds that come with the app, bundled with the UI by Vite. */
export const PRESET_SOURCES: Readonly<Record<BackgroundPreset, string>> = {
  aurora,
  dusk,
  ocean,
  forest,
  ember,
  nebula,
};

/**
 * The picture the background layer shows for a choice, or null for none. An imported
 * background that is no longer in the gallery, or whose file was deleted by hand, shows none.
 */
export function backgroundSource(
  choice: BackgroundChoice,
  gallery: readonly ImportedBackground[],
): string | null {
  switch (choice.kind) {
    case 'none':
      return null;
    case 'preset':
      return PRESET_SOURCES[choice.id];
    case 'imported': {
      const background = gallery.find((candidate) => candidate.id === choice.id);
      return background === undefined || background.isMissing
        ? null
        : backgroundImageSource(background.sha256);
    }
  }
}
