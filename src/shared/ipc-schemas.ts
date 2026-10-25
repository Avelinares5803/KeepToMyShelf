/**
 * Validation schemas for every IPC input. Used only by the main process, which never
 * trusts data coming from the renderer. Kept apart from ipc.ts so the sandboxed preload
 * script does not depend on zod (a sandboxed preload cannot load npm packages).
 */
import { z } from 'zod';
import { ITEM_STATUSES } from '../core/items/item-draft';
import { ITEM_KINDS } from './content';
import { languageSchema, settingUpdateSchema, themeSchema } from './settings';

const profileIdSchema = z.uuid();
const sessionTokenSchema = z.uuid();
// Generous upper bound to reject absurd payloads; the real rules live in core/profiles.
const profileNameSchema = z.string().max(200);

// Item input: zod checks the shape and rejects absurd payloads; core/items applies the
// business rules (lengths, dates that exist, kind-specific fields) with translatable errors.
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
const itemDraftSchema = z.object({
  title: z.string().max(5_000),
  alternateTitles: z.array(z.string().max(5_000)).max(500),
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
});

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
  createItem: z.object({ token: sessionTokenSchema, kind: itemKindSchema, draft: itemDraftSchema }),
  updateItem: z.object({ token: sessionTokenSchema, id: itemIdSchema, draft: itemDraftSchema }),
  moveItemToTrash: z.object({ token: sessionTokenSchema, id: itemIdSchema }),
  restoreItem: z.object({ token: sessionTokenSchema, id: itemIdSchema }),
  deleteItemPermanently: z.object({ token: sessionTokenSchema, id: itemIdSchema }),
  emptyTrash: z.object({ token: sessionTokenSchema, kind: itemKindSchema.nullable() }),
} as const;

export type IpcInputSchemas = typeof ipcInputSchemas;
