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

/** The backgrounds that come with the app; their pictures live in the UI. */
export const BACKGROUND_PRESETS = ['aurora', 'dusk', 'ocean', 'forest', 'ember', 'nebula'] as const;
/** Strongest background blur, in CSS pixels. */
export const BACKGROUND_BLUR_MAX = 40;
/** Strongest dimming of the background, in percent of the theme's colour over it. */
export const BACKGROUND_DIM_MAX = 90;
/** Longest side of optimized backgrounds that Settings offers, in pixels. */
export const BACKGROUND_MAX_SIDES = [1920, 2560, 3840, 5120, 7680] as const;

export const languageSchema = z.enum(LANGUAGES);
export const themeSchema = z.enum(THEMES);
export const imageImportChoiceSchema = z.enum(IMAGE_IMPORT_CHOICES);
export const optimizedMaxSideSchema = z.literal(OPTIMIZED_MAX_SIDES);
export const maxDocumentMegabytesSchema = z.literal(MAX_DOCUMENT_MEGABYTES);
/** No background, one that comes with the app, or one imported to the common gallery. */
export const backgroundChoiceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('preset'), id: z.enum(BACKGROUND_PRESETS) }),
  z.object({ kind: z.literal('imported'), id: z.number().int().positive() }),
]);
export const backgroundBlurSchema = z.number().int().min(0).max(BACKGROUND_BLUR_MAX);
export const backgroundDimSchema = z.number().int().min(0).max(BACKGROUND_DIM_MAX);
export const backgroundMaxSideSchema = z.literal(BACKGROUND_MAX_SIDES);

/** Every user preference, with the schema its stored value must satisfy. */
export const settingSchemas = {
  language: languageSchema,
  theme: themeSchema,
  imageImportChoice: imageImportChoiceSchema,
  optimizedMaxSide: optimizedMaxSideSchema,
  maxDocumentMegabytes: maxDocumentMegabytesSchema,
  background: backgroundChoiceSchema,
  backgroundBlur: backgroundBlurSchema,
  // The veil over the background: each theme has its own, as it looks different on each.
  backgroundDimLight: backgroundDimSchema,
  backgroundDimDark: backgroundDimSchema,
  backgroundImportChoice: imageImportChoiceSchema,
  backgroundMaxSide: backgroundMaxSideSchema,
} as const;

export type Language = z.infer<typeof languageSchema>;
export type Theme = z.infer<typeof themeSchema>;
export type ImageImportChoice = z.infer<typeof imageImportChoiceSchema>;
export type OptimizedMaxSide = z.infer<typeof optimizedMaxSideSchema>;
export type MaxDocumentMegabytes = z.infer<typeof maxDocumentMegabytesSchema>;
export type BackgroundPreset = (typeof BACKGROUND_PRESETS)[number];
export type BackgroundChoice = z.infer<typeof backgroundChoiceSchema>;
export type BackgroundMaxSide = z.infer<typeof backgroundMaxSideSchema>;
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

/** The background a profile has when it never chose one, or when its background is deleted. */
export const NO_BACKGROUND: BackgroundChoice = { kind: 'none' };

/** Defaults of the background preferences. */
export const BACKGROUND_SETTING_DEFAULTS = {
  background: NO_BACKGROUND,
  backgroundBlur: 8,
  backgroundDimLight: 40,
  backgroundDimDark: 62,
  backgroundImportChoice: 'ask',
  backgroundMaxSide: 3840,
} as const satisfies Pick<
  AppSettings,
  | 'background'
  | 'backgroundBlur'
  | 'backgroundDimLight'
  | 'backgroundDimDark'
  | 'backgroundImportChoice'
  | 'backgroundMaxSide'
>;

/** The dimming preference of each theme as shown (the system's, for "system"). */
export const BACKGROUND_DIM_KEYS = {
  light: 'backgroundDimLight',
  dark: 'backgroundDimDark',
} as const;

/** One preference change: `{ key: 'language', value: 'en' }`. */
export const settingUpdateSchema = z.discriminatedUnion('key', [
  z.object({ key: z.literal('language'), value: languageSchema }),
  z.object({ key: z.literal('theme'), value: themeSchema }),
  z.object({ key: z.literal('imageImportChoice'), value: imageImportChoiceSchema }),
  z.object({ key: z.literal('optimizedMaxSide'), value: optimizedMaxSideSchema }),
  z.object({ key: z.literal('maxDocumentMegabytes'), value: maxDocumentMegabytesSchema }),
  z.object({ key: z.literal('background'), value: backgroundChoiceSchema }),
  z.object({ key: z.literal('backgroundBlur'), value: backgroundBlurSchema }),
  z.object({ key: z.literal('backgroundDimLight'), value: backgroundDimSchema }),
  z.object({ key: z.literal('backgroundDimDark'), value: backgroundDimSchema }),
  z.object({ key: z.literal('backgroundImportChoice'), value: imageImportChoiceSchema }),
  z.object({ key: z.literal('backgroundMaxSide'), value: backgroundMaxSideSchema }),
]);
export type SettingUpdate = z.infer<typeof settingUpdateSchema>;

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(settingSchemas, key);
}
