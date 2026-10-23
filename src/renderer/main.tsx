import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { AppSettings } from '../shared/settings';
import { App } from './app/App';
import { applyTheme } from './app/theme';
import { initI18n } from './i18n';
import './styles/global.css';

const FALLBACK_SETTINGS: AppSettings = { language: 'es', theme: 'system' };

async function loadStartupSettings(): Promise<AppSettings> {
  const result = await window.api.settings.getGlobal();
  if (result.ok) return result.value;
  // The UI must still appear; the error is logged and fallback preferences are used.
  console.error('Could not load settings', result.error);
  return FALLBACK_SETTINGS;
}

async function bootstrap(): Promise<void> {
  const container = document.getElementById('root');
  if (!container) {
    throw new Error('Root element #root not found');
  }
  const settings = await loadStartupSettings();
  await initI18n(settings.language);
  await applyTheme(settings.theme);
  createRoot(container).render(
    <StrictMode>
      <App initialSettings={settings} />
    </StrictMode>,
  );
}

void bootstrap();
