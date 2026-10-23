import type { Theme } from '../../shared/settings';

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
