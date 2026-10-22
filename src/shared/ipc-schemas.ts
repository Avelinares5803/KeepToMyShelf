/**
 * Validation schemas for every IPC input. Used only by the main process, which never
 * trusts data coming from the renderer. Kept apart from ipc.ts so the sandboxed preload
 * script does not depend on zod (a sandboxed preload cannot load npm packages).
 */
import { z } from 'zod';
import { languageSchema, settingUpdateSchema } from './settings';

const profileIdSchema = z.uuid();
const sessionTokenSchema = z.uuid();
// Generous upper bound to reject absurd payloads; the real rules live in core/profiles.
const profileNameSchema = z.string().max(200);

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
} as const;

export type IpcInputSchemas = typeof ipcInputSchemas;
