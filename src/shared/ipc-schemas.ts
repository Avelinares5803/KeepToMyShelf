/**
 * Validation schemas for every IPC input. Used only by the main process, which never
 * trusts data coming from the renderer. Kept apart from ipc.ts so the sandboxed preload
 * script does not depend on zod (a sandboxed preload cannot load npm packages).
 */
import { z } from 'zod';
import { CATALOGS, ITEM_ROLES } from '../core/catalogs/catalogs';
import { ITEM_STATUSES } from '../core/items/item-draft';
import { IMAGE_STORAGE_CHOICES } from '../core/media/import-rules';
import { ITEM_KINDS } from './content';
import { languageSchema, settingUpdateSchema, themeSchema } from './settings';

const profileIdSchema = z.uuid();
const sessionTokenSchema = z.uuid();
// Generous upper bound to reject absurd payloads; the real rules live in core/profiles.
const profileNameSchema = z.string().max(200);

// Item input: zod checks the shape and rejects absurd payloads; core/items applies the
// business rules (lengths, dates that exist, kind-specific fields) with translatable errors.
const catalogSchema = z.enum(CATALOGS);
const catalogEntryIdSchema = z.number().int().positive();
const catalogEntryInputSchema = z.object({
  name: z.string().max(1_000),
  aliases: z.array(z.string().max(1_000)).max(500).readonly(),
  scope: z.enum(['movie', 'series']).nullable(),
});

const itemKindSchema = z.enum(ITEM_KINDS);
const itemIdSchema = z.number().int().positive();
const partialDateSchema = z.object({
  year: z.number(),
  month: z.number().optional(),
  day: z.number().optional(),
});
const usageDateSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('known'), date: partialDateSchema }),
    z.object({ kind: z.literal('unknown') }),
  ])
  .nullable();
const entryRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('existing'), id: catalogEntryIdSchema }),
  z.object({ kind: z.literal('new'), name: z.string().max(1_000) }),
]);
const relationsSchema = z.partialRecord(
  z.enum(ITEM_ROLES),
  z.array(entryRefSchema).max(5_000).readonly(),
);
const releaseSchema = z.object({ region: entryRefSchema.nullable(), date: partialDateSchema });
const itemDraftSchema = z.object({
  title: z.string().max(5_000),
  alternateTitles: z.array(z.string().max(5_000)).max(500).readonly(),
  description: z.string().max(500_000),
  notes: z.string().max(500_000),
  isFavorite: z.boolean(),
  rating: z.number().nullable(),
  status: z.enum(ITEM_STATUSES).nullable(),
  isReplay: z.boolean(),
  ownsPhysical: z.boolean(),
  ownsDigital: z.boolean(),
  startedOn: usageDateSchema,
  finishedOn: usageDateSchema,
  minutesPlayed: z.number().nullable(),
  seasonsCount: z.number().nullable(),
  episodesCount: z.number().nullable(),
  relations: relationsSchema,
  releases: z.array(releaseSchema).max(1_000).readonly(),
});

const preparedIdSchema = z.uuid();
const mediaIdSchema = z.number().int().positive();
const imagePlanEntrySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('existing'), mediaId: mediaIdSchema }),
  z.object({
    kind: z.literal('prepared'),
    preparedId: preparedIdSchema,
    choice: z.enum(IMAGE_STORAGE_CHOICES),
  }),
  z.object({ kind: z.literal('use_original'), mediaId: mediaIdSchema }),
]);
const imagePlanSchema = z.array(imagePlanEntrySchema).max(1_000).readonly();
// null removes the cover; left out, it does not change.
const coverPlanSchema = imagePlanEntrySchema.nullable();
// The name is checked by the service (cleanDocumentLabel); here only its size is bounded.
const documentLabelSchema = z.string().max(1_000);
const documentPlanSchema = z
  .array(
    z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('existing'), mediaId: mediaIdSchema, label: documentLabelSchema }),
      z.object({
        kind: z.literal('prepared'),
        preparedId: preparedIdSchema,
        label: documentLabelSchema,
      }),
    ]),
  )
  .max(1_000)
  .readonly();

export const ipcInputSchemas = {
  getAppInfo: z.undefined(),
  listProfiles: z.undefined(),
  createProfile: z.object({ name: profileNameSchema, language: languageSchema.optional() }),
  renameProfile: z.object({ profileId: profileIdSchema, name: profileNameSchema }),
  deleteProfile: z.object({ profileId: profileIdSchema }),
  openSession: z.object({ profileId: profileIdSchema }),
  closeSession: z.object({ token: sessionTokenSchema }),
  getGlobalSettings: z.undefined(),
  getProfileSettings: z.object({ token: sessionTokenSchema }),
  setGlobalSetting: z.object({ setting: settingUpdateSchema }),
  setProfileSetting: z.object({ token: sessionTokenSchema, setting: settingUpdateSchema }),
  applySettingToAllProfiles: z.object({ setting: settingUpdateSchema }),
  setNativeTheme: z.object({ theme: themeSchema }),
  listItems: z.object({ token: sessionTokenSchema, kind: itemKindSchema }),
  listTrash: z.object({ token: sessionTokenSchema, kind: itemKindSchema.nullable() }),
  getItem: z.object({ token: sessionTokenSchema, id: itemIdSchema }),
  // `cover` is the item's cover, `images` its whole gallery and `documents` all its
  // documents; left out, they do not change.
  createItem: z.object({
    token: sessionTokenSchema,
    kind: itemKindSchema,
    draft: itemDraftSchema,
    cover: coverPlanSchema.optional(),
    images: imagePlanSchema.optional(),
    documents: documentPlanSchema.optional(),
  }),
  updateItem: z.object({
    token: sessionTokenSchema,
    id: itemIdSchema,
    draft: itemDraftSchema,
    cover: coverPlanSchema.optional(),
    images: imagePlanSchema.optional(),
    documents: documentPlanSchema.optional(),
  }),
  moveItemToTrash: z.object({ token: sessionTokenSchema, id: itemIdSchema }),
  restoreItem: z.object({ token: sessionTokenSchema, id: itemIdSchema }),
  deleteItemPermanently: z.object({ token: sessionTokenSchema, id: itemIdSchema }),
  emptyTrash: z.object({ token: sessionTokenSchema, kind: itemKindSchema.nullable() }),
  listCatalog: z.object({ token: sessionTokenSchema, catalog: catalogSchema }),
  createCatalogEntry: z.object({
    token: sessionTokenSchema,
    catalog: catalogSchema,
    entry: catalogEntryInputSchema,
  }),
  updateCatalogEntry: z.object({
    token: sessionTokenSchema,
    id: catalogEntryIdSchema,
    entry: catalogEntryInputSchema,
  }),
  deleteCatalogEntry: z.object({ token: sessionTokenSchema, id: catalogEntryIdSchema }),
  deleteUnusedCatalogEntries: z.object({ token: sessionTokenSchema, catalog: catalogSchema }),
  // The dialog's file-type filter is named in the UI language, which only the UI knows.
  // `multiple` is false for the cover, which is a single image.
  pickImages: z.object({
    token: sessionTokenSchema,
    filterName: z.string().min(1).max(100),
    multiple: z.boolean(),
  }),
  pickDocuments: z.object({ token: sessionTokenSchema, filterName: z.string().min(1).max(100) }),
  openDocument: z.object({
    token: sessionTokenSchema,
    itemId: itemIdSchema,
    mediaId: mediaIdSchema,
  }),
  discardImports: z.object({
    token: sessionTokenSchema,
    preparedIds: z.array(preparedIdSchema).max(1_000).readonly(),
  }),
  listItemMedia: z.object({ token: sessionTokenSchema, itemId: itemIdSchema }),
} as const;

export type IpcInputSchemas = typeof ipcInputSchemas;
