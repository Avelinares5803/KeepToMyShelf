import { z } from 'zod';

export const LANGUAGES = ['es', 'en'] as const;
export const THEMES = ['system', 'light', 'dark'] as const;

export const languageSchema = z.enum(LANGUAGES);
export const themeSchema = z.enum(THEMES);

/** Every user preference, with the schema its stored value must satisfy. */
export const settingSchemas = {
  language: languageSchema,
  theme: themeSchema,
} as const;

export type Language = z.infer<typeof languageSchema>;
export type Theme = z.infer<typeof themeSchema>;
export type SettingKey = keyof typeof settingSchemas;
export type AppSettings = { [K in SettingKey]: z.infer<(typeof settingSchemas)[K]> };

/** One preference change: `{ key: 'language', value: 'en' }`. */
export const settingUpdateSchema = z.discriminatedUnion('key', [
  z.object({ key: z.literal('language'), value: languageSchema }),
  z.object({ key: z.literal('theme'), value: themeSchema }),
]);
export type SettingUpdate = z.infer<typeof settingUpdateSchema>;

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(settingSchemas, key);
}
