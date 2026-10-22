import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Language } from '../../shared/settings';
import en from './locales/en.json';
import es from './locales/es.json';

export const resources = { es: { translation: es }, en: { translation: en } } as const;

/** Loads both languages up front: switching language re-renders the UI without restarting. */
export async function initI18n(language: Language): Promise<void> {
  await i18n.use(initReactI18next).init({
    resources,
    lng: language,
    fallbackLng: 'es',
    interpolation: { escapeValue: false }, // React already escapes rendered text.
  });
  document.documentElement.lang = language;
}

export async function changeLanguage(language: Language): Promise<void> {
  await i18n.changeLanguage(language);
  document.documentElement.lang = language;
}
