import { BrowserWindow, dialog } from 'electron';

/** Extensions offered by the image dialog. The real format is checked by content later. */
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'];

/**
 * Opens the system dialog to choose images, attached to the app window so it stays on top.
 * Resolves to the chosen paths, or null if the user cancelled. Only the main process ever
 * sees these paths.
 */
export async function chooseImageFiles(filterName: string): Promise<string[] | null> {
  const options: Electron.OpenDialogOptions = {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: filterName, extensions: IMAGE_EXTENSIONS }],
  };
  const window = BrowserWindow.getFocusedWindow();
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths;
}
