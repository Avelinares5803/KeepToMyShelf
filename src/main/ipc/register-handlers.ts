import { app, ipcMain } from 'electron';
import { IpcChannels } from '../../shared/ipc';
import { ipcInputSchemas } from '../../shared/ipc-schemas';
import type { ProfileService } from '../application/profile-service';
import type { SessionManager } from '../application/session-manager';
import type { SettingsService } from '../application/settings-service';
import { createHandler } from './create-handler';

export interface Services {
  readonly profiles: ProfileService;
  readonly sessions: SessionManager;
  readonly settings: SettingsService;
}

/** IPC handlers stay thin: validate input (createHandler) and delegate to a service. */
export function registerIpcHandlers({ profiles, sessions, settings }: Services): void {
  const handlers: Record<keyof typeof IpcChannels, (input: unknown) => unknown> = {
    getAppInfo: createHandler(ipcInputSchemas.getAppInfo, () => ({
      name: app.getName(),
      version: app.getVersion(),
    })),
    listProfiles: createHandler(ipcInputSchemas.listProfiles, () => profiles.list()),
    createProfile: createHandler(ipcInputSchemas.createProfile, (input) => profiles.create(input)),
    renameProfile: createHandler(ipcInputSchemas.renameProfile, ({ profileId, name }) =>
      profiles.rename(profileId, name),
    ),
    deleteProfile: createHandler(ipcInputSchemas.deleteProfile, ({ profileId }) =>
      profiles.delete(profileId),
    ),
    openSession: createHandler(ipcInputSchemas.openSession, ({ profileId }) => {
      const { token } = sessions.open(profileId);
      return { token, profile: profiles.get(profileId) };
    }),
    closeSession: createHandler(ipcInputSchemas.closeSession, ({ token }) => sessions.close(token)),
    getGlobalSettings: createHandler(ipcInputSchemas.getGlobalSettings, () => settings.getGlobal()),
    getProfileSettings: createHandler(ipcInputSchemas.getProfileSettings, ({ token }) =>
      settings.getForProfile(sessions.require(token).profileId),
    ),
    setGlobalSetting: createHandler(ipcInputSchemas.setGlobalSetting, ({ setting }) =>
      settings.setGlobal(setting),
    ),
    setProfileSetting: createHandler(ipcInputSchemas.setProfileSetting, ({ token, setting }) =>
      settings.setForProfile(sessions.require(token).profileId, setting),
    ),
    applySettingToAllProfiles: createHandler(
      ipcInputSchemas.applySettingToAllProfiles,
      ({ setting }) => settings.applyToAllProfiles(setting),
    ),
  };

  for (const [name, handler] of Object.entries(handlers)) {
    const channel = IpcChannels[name as keyof typeof IpcChannels];
    ipcMain.handle(channel, (_event, input: unknown) => handler(input));
  }
}
