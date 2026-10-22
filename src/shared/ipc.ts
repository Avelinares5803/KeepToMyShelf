/**
 * Contract between the renderer (UI) and the main process.
 * The preload script implements `KeepToMyShelfApi` and exposes it as `window.api`.
 *
 * This file is imported by the sandboxed preload script, so it may only import types:
 * input validation lives in ipc-schemas.ts and runs in the main process.
 */
import type { z } from 'zod';
import type { IpcInputSchemas } from './ipc-schemas';
import type { AppSettings } from './settings';

export const IpcChannels = {
  getAppInfo: 'app:get-info',
  listProfiles: 'profiles:list',
  createProfile: 'profiles:create',
  renameProfile: 'profiles:rename',
  deleteProfile: 'profiles:delete',
  openSession: 'session:open',
  closeSession: 'session:close',
  getGlobalSettings: 'settings:get-global',
  getProfileSettings: 'settings:get-profile',
  setGlobalSetting: 'settings:set-global',
  setProfileSetting: 'settings:set-profile',
  applySettingToAllProfiles: 'settings:apply-to-all',
} as const;

/** Every IPC call resolves to a result; expected errors carry a translatable code. */
export type IpcResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: IpcErrorPayload };

export interface IpcErrorPayload {
  readonly code: string;
  readonly message: string;
}

export interface AppInfo {
  name: string;
  version: string;
}

export interface Profile {
  id: string;
  name: string;
  createdAt: string;
  lastOpenedAt: string | null;
}

export interface ProfileChange {
  profile: Profile;
  /** True when "(n)" was appended because the requested name was already taken. */
  renamed: boolean;
}

export interface SessionInfo {
  token: string;
  profile: Profile;
}

export type IpcInput<K extends keyof IpcInputSchemas> = z.infer<IpcInputSchemas[K]>;

export interface KeepToMyShelfApi {
  getAppInfo(): Promise<IpcResult<AppInfo>>;
  profiles: {
    list(): Promise<IpcResult<Profile[]>>;
    create(input: IpcInput<'createProfile'>): Promise<IpcResult<ProfileChange>>;
    rename(input: IpcInput<'renameProfile'>): Promise<IpcResult<ProfileChange>>;
    delete(input: IpcInput<'deleteProfile'>): Promise<IpcResult<void>>;
  };
  session: {
    open(input: IpcInput<'openSession'>): Promise<IpcResult<SessionInfo>>;
    close(input: IpcInput<'closeSession'>): Promise<IpcResult<void>>;
  };
  settings: {
    getGlobal(): Promise<IpcResult<AppSettings>>;
    getForProfile(input: IpcInput<'getProfileSettings'>): Promise<IpcResult<AppSettings>>;
    setGlobal(input: IpcInput<'setGlobalSetting'>): Promise<IpcResult<void>>;
    setForProfile(input: IpcInput<'setProfileSetting'>): Promise<IpcResult<void>>;
    applyToAllProfiles(input: IpcInput<'applySettingToAllProfiles'>): Promise<IpcResult<void>>;
  };
}
