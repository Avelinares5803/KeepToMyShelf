/**
 * Contract between the renderer (UI) and the main process.
 * The preload script implements `KeepToMyShelfApi` and exposes it as `window.api`.
 */
export const IpcChannels = {
  getAppInfo: 'app:get-info',
} as const;

export interface AppInfo {
  name: string;
  version: string;
}

export interface KeepToMyShelfApi {
  getAppInfo(): Promise<AppInfo>;
}
