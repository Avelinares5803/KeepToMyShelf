// Characters Windows does not allow in file names.
const FORBIDDEN_IN_FILE_NAMES = /[<>:"/\\|?*\p{Cc}]/gu;

/** Replaces each character Windows does not allow in a file name with "_". */
export function replaceForbiddenFileNameCharacters(text: string): string {
  return text.replace(FORBIDDEN_IN_FILE_NAMES, '_');
}
