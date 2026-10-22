import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Language } from '../shared/settings';
import { App } from './app/App';
import { initI18n } from './i18n';
import './styles/global.css';

async function loadStartupLanguage(): Promise<Language> {
  const result = await window.api.settings.getGlobal();
  if (result.ok) return result.value.language;
  // The UI must still appear; the error is logged and Spanish is used.
  console.error('Could not load settings', result.error);
  return 'es';
}

async function bootstrap(): Promise<void> {
  const container = document.getElementById('root');
  if (!container) {
    throw new Error('Root element #root not found');
  }
  await initI18n(await loadStartupLanguage());
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
