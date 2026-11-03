import { ValidationError } from '../errors';
import { characterCount, cleanSingleLine } from '../text/clean-text';

/** Longest name of a document, in characters. */
export const DOCUMENT_LABEL_MAX_LENGTH = 200;

const PDF_EXTENSION = /\.pdf$/i;
const CONTROL_CHARACTERS = /\p{Cc}/gu;

/**
 * The name a document gets when it is added: its file name without ".pdf" (all documents are
 * PDF, so the extension only adds noise). Any other file name is kept as it is.
 */
export function labelFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(PDF_EXTENSION, '');
  const base = withoutExtension.trim() === '' ? fileName : withoutExtension;
  const clean = cleanSingleLine(base.replace(CONTROL_CHARACTERS, ' ')) ?? '';
  return [...clean].slice(0, DOCUMENT_LABEL_MAX_LENGTH).join('');
}

/** Checks the name the user gave a document; it may not be empty. */
export function cleanDocumentLabel(raw: string): string {
  const label = cleanSingleLine(raw);
  if (label === null) {
    throw new ValidationError(
      'media.label_invalid_characters',
      'The document name has control characters',
    );
  }
  if (label === '') {
    throw new ValidationError('media.label_required', 'The document name is empty');
  }
  if (characterCount(label) > DOCUMENT_LABEL_MAX_LENGTH) {
    throw new ValidationError(
      'media.label_too_long',
      `The document name has more than ${DOCUMENT_LABEL_MAX_LENGTH} characters`,
    );
  }
  return label;
}

// Characters Windows does not allow in file names, and names it reserves for devices.
const FORBIDDEN_IN_FILE_NAMES = /[<>:"/\\|?*\p{Cc}]/gu;
const RESERVED_FILE_NAMES = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const TRAILING_DOTS_AND_SPACES = /[. ]+$/;
// Keeps the whole path well under the 260 characters some programs still expect.
const FILE_NAME_MAX_LENGTH = 120;

/**
 * The file name of the copy opened in the system viewer, so the viewer shows the document's
 * name: "Manual de Zelda" → "Manual de Zelda.pdf". Made safe for Windows.
 */
export function fileNameForLabel(label: string): string {
  let base = label.replace(FORBIDDEN_IN_FILE_NAMES, '_').trim();
  base = [...base].slice(0, FILE_NAME_MAX_LENGTH).join('').replace(TRAILING_DOTS_AND_SPACES, '');
  if (base === '') base = 'document';
  if (RESERVED_FILE_NAMES.test(base)) base = `_${base}`;
  return `${base}.pdf`;
}
