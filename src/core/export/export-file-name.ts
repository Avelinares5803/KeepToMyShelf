import type { ExportTarget } from '../../shared/exports';
import type { Language } from '../../shared/settings';
import { localStamp, safeProfileName } from '../backups/backup-file-name';

const CONTENT_NAMES = {
  library: { es: 'Biblioteca', en: 'Library' },
  game: { es: 'Videojuegos', en: 'Video games' },
  movie: { es: 'Películas', en: 'Movies' },
  series: { es: 'Series', en: 'Series' },
} as const;

/** The name offered: "KeepToMyShelf - Ana - Videojuegos - 2026-11-25 18-30.csv". */
export function exportFileName(
  profileName: string,
  target: ExportTarget,
  language: Language,
  date: Date,
): string {
  const content = CONTENT_NAMES[target.format === 'json' ? 'library' : target.kind][language];
  const stamp = localStamp(date, false);
  return `KeepToMyShelf - ${safeProfileName(profileName)} - ${content} - ${stamp}.${target.format}`;
}
