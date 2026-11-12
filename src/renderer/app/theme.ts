import { useSyncExternalStore } from 'react';
import type { Theme } from '../../shared/settings';

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)');

function subscribeToSystemTheme(onChange: () => void): () => void {
  const query = systemDark();
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/**
 * The theme shown: "system" becomes the system's light or dark, and follows it when it
 * changes. (The query follows the native theme, which applyTheme sets to "system" then.)
 */
export function useShownTheme(theme: Theme): 'light' | 'dark' {
  const isSystemDark = useSyncExternalStore(subscribeToSystemTheme, () => systemDark().matches);
  if (theme !== 'system') return theme;
  return isSystemDark ? 'dark' : 'light';
}

/**
 * Applies the theme to the UI (CSS reads `data-theme` on <html>) and to native parts of the
 * window such as the Windows title bar. "system" follows the operating system setting.
 */
export async function applyTheme(theme: Theme): Promise<void> {
  document.documentElement.dataset['theme'] = theme;
  const result = await window.api.window.setNativeTheme({ theme });
  if (!result.ok) {
    // Only the title bar colour is affected; the UI itself is already themed.
    console.error('Could not apply the native theme', result.error);
  }
}
