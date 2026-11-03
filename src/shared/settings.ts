import { z } from 'zod';
import { IMAGE_STORAGE_CHOICES } from '../core/media/import-rules';

export const LANGUAGES = ['es', 'en'] as const;
export const THEMES = ['system', 'light', 'dark'] as const;
/** 'ask' shows the import window; any other value is the choice the user asked to remember. */
export const IMAGE_IMPORT_CHOICES = ['ask', ...IMAGE_STORAGE_CHOICES] as const;
/** Longest side of optimized covers and gallery images that Settings offers, in pixels. */
export const OPTIMIZED_MAX_SIDES = [1280, 1600, 2000, 2560, 3200, 3840] as const;
/** Largest PDF that can be imported that Settings offers, in megabytes. */
export const MAX_DOCUMENT_MEGABYTES = [50, 100, 200, 500, 1000] as const;

export const languageSchema = z.enum(LANGUAGES);
export const themeSchema = z.enum(THEMES);
export const imageImportChoiceSchema = z.enum(IMAGE_IMPORT_CHOICES);
export const optimizedMaxSideSchema = z.literal(OPTIMIZED_MAX_SIDES);
export const maxDocumentMegabytesSchema = z.literal(MAX_DOCUMENT_MEGABYTES);

/** Every user preference, with the schema its stored value must satisfy. */
export const settingSchemas = {
  language: languageSchema,
  theme: themeSchema,
  imageImportChoice: imageImportChoiceSchema,
  optimizedMaxSide: optimizedMaxSideSchema,
  maxDocumentMegabytes: maxDocumentMegabytesSchema,
} as const;

export type Language = z.infer<typeof languageSchema>;
export type Theme = z.infer<typeof themeSchema>;
export type ImageImportChoice = z.infer<typeof imageImportChoiceSchema>;
export type OptimizedMaxSide = z.infer<typeof optimizedMaxSideSchema>;
export type MaxDocumentMegabytes = z.infer<typeof maxDocumentMegabytesSchema>;
export type SettingKey = keyof typeof settingSchemas;
export type AppSettings = { [K in SettingKey]: z.infer<(typeof settingSchemas)[K]> };

/** Defaults of the preferences that do not depend on the system (language does). */
export const MEDIA_SETTING_DEFAULTS = {
  imageImportChoice: 'ask',
  optimizedMaxSide: 2000,
  maxDocumentMegabytes: 200,
} as const satisfies Pick<
  AppSettings,
  'imageImportChoice' | 'optimizedMaxSide' | 'maxDocumentMegabytes'
>;

/** One preference change: `{ key: 'language', value: 'en' }`. */
export const settingUpdateSchema = z.discriminatedUnion('key', [
  z.object({ key: z.literal('language'), value: languageSchema }),
  z.object({ key: z.literal('theme'), value: themeSchema }),
  z.object({ key: z.literal('imageImportChoice'), value: imageImportChoiceSchema }),
  z.object({ key: z.literal('optimizedMaxSide'), value: optimizedMaxSideSchema }),
  z.object({ key: z.literal('maxDocumentMegabytes'), value: maxDocumentMegabytesSchema }),
]);
export type SettingUpdate = z.infer<typeof settingUpdateSchema>;

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(settingSchemas, key);
}
