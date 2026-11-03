import { BrowserWindow, dialog } from 'electron';

/** Extensions offered by each dialog. The real format is checked by content later. */
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'];
const DOCUMENT_EXTENSIONS = ['pdf'];

/**
 * Opens the system dialog to choose images (one, or several when `multiple`), attached to the
 * app window so it stays on top. Resolves to the chosen paths, or null if the user cancelled.
 * Only the main process ever sees these paths.
 */
export function chooseImageFiles(filterName: string, multiple: boolean): Promise<string[] | null> {
  return chooseFiles(filterName, IMAGE_EXTENSIONS, multiple);
}

/** Like `chooseImageFiles`, for PDF documents; several can be chosen at once. */
export function chooseDocumentFiles(filterName: string): Promise<string[] | null> {
  return chooseFiles(filterName, DOCUMENT_EXTENSIONS, true);
}

async function chooseFiles(
  filterName: string,
  extensions: string[],
  multiple: boolean,
): Promise<string[] | null> {
  const options: Electron.OpenDialogOptions = {
    properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: [{ name: filterName, extensions }],
  };
  const window = BrowserWindow.getFocusedWindow();
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths;
}
