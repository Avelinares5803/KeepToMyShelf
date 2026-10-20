import type { KeepToMyShelfApi } from '../shared/ipc';

declare global {
  interface Window {
    api: KeepToMyShelfApi;
  }
}

export {};
