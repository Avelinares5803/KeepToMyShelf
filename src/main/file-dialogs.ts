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

/**
 * Opens the system "Save as" dialog for a backup, suggesting `defaultPath`. Resolves to the
 * chosen path, or null if the user cancelled. Windows adds ".zip" from the filter when the user
 * leaves it out, and asks before replacing an existing file.
 */
export function chooseBackupDestination(
  filterName: string,
  defaultPath: string,
): Promise<string | null> {
  return chooseDestination(filterName, 'zip', defaultPath);
}

/** Like `chooseBackupDestination`, for an export of the library. */
export function chooseExportDestination(
  filterName: string,
  format: 'json' | 'csv',
  defaultPath: string,
): Promise<string | null> {
  return chooseDestination(filterName, format, defaultPath);
}

async function chooseDestination(
  filterName: string,
  extension: string,
  defaultPath: string,
): Promise<string | null> {
  const options: Electron.SaveDialogOptions = {
    defaultPath,
    filters: [{ name: filterName, extensions: [extension] }],
    properties: ['showOverwriteConfirmation'],
  };
  const window = BrowserWindow.getFocusedWindow();
  const result = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options);
  return result.canceled || !result.filePath ? null : result.filePath;
}

/** Opens the system dialog to choose one backup (.zip) to restore; null if cancelled. */
export async function chooseBackupToRestore(filterName: string): Promise<string | null> {
  const paths = await chooseFiles(filterName, ['zip'], false);
  return paths?.[0] ?? null;
}

/** Opens the system dialog to choose one JSON export of a library to import; null if cancelled. */
export async function chooseLibraryToImport(filterName: string): Promise<string | null> {
  const paths = await chooseFiles(filterName, ['json'], false);
  return paths?.[0] ?? null;
}

/** Like `chooseLibraryToImport`, for a CSV file with the items of one kind. */
export async function chooseCsvToImport(filterName: string): Promise<string | null> {
  const paths = await chooseFiles(filterName, ['csv'], false);
  return paths?.[0] ?? null;
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
