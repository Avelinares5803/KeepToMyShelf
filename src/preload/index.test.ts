import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KeepToMyShelfApi } from '../shared/ipc';

// The preload only runs inside Electron: its electron module is replaced, and the api it
// exposes to the page is captured.
const electron = vi.hoisted(() => ({
  exposed: {} as Record<string, unknown>,
  invoke: vi.fn(),
  getPathForFile: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, value: unknown) => {
      electron.exposed[key] = value;
    },
  },
  ipcRenderer: { invoke: electron.invoke, on: vi.fn(), removeListener: vi.fn() },
  webUtils: { getPathForFile: electron.getPathForFile },
}));

let api: KeepToMyShelfApi;

beforeAll(async () => {
  await import('./index');
  api = electron.exposed.api as KeepToMyShelfApi;
});

beforeEach(() => {
  electron.invoke.mockReset().mockResolvedValue({ ok: true, value: null });
  electron.getPathForFile.mockReset();
});

describe('media.prepareDropped', () => {
  it('sends the path Electron gives for each dropped file, and its name', async () => {
    const paths = new Map([
      ['caja.png', 'C:\\Users\\Adrián\\caja.png'],
      ['web.png', ''],
    ]);
    electron.getPathForFile.mockImplementation((file: File) => paths.get(file.name));
    const files = [new File(['a'], 'caja.png'), new File(['b'], 'web.png')];

    await api.media.prepareDropped({ token: 't', expected: 'image', files });

    expect(electron.getPathForFile.mock.calls.map(([file]) => file)).toEqual(files);
    expect(electron.invoke).toHaveBeenCalledWith('media:prepare-dropped', {
      token: 't',
      expected: 'image',
      files: [
        { name: 'caja.png', path: 'C:\\Users\\Adrián\\caja.png' },
        { name: 'web.png', path: '' },
      ],
    });
  });

  it('never forwards a path the page put on the object it passes', async () => {
    electron.getPathForFile.mockReturnValue('');
    const forged = Object.assign(new File(['a'], 'hosts'), {
      path: 'C:\\Windows\\System32\\drivers\\etc\\hosts',
    });

    await api.media.prepareDropped({ token: 't', expected: 'document', files: [forged] });

    expect(electron.invoke).toHaveBeenCalledWith('media:prepare-dropped', {
      token: 't',
      expected: 'document',
      files: [{ name: 'hosts', path: '' }],
    });
  });
});
