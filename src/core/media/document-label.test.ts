import { describe, expect, it } from 'vitest';
import { AppError } from '../errors';
import {
  cleanDocumentLabel,
  DOCUMENT_LABEL_MAX_LENGTH,
  fileNameForLabel,
  labelFromFileName,
} from './document-label';

const codeOf = (run: () => unknown): string | null => {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof AppError ? error.code : 'not an AppError';
  }
};

describe('labelFromFileName', () => {
  it('drops the .pdf extension, in any case', () => {
    expect(labelFromFileName('Manual de Zelda.pdf')).toBe('Manual de Zelda');
    expect(labelFromFileName('GUÍA.PDF')).toBe('GUÍA');
  });

  it('keeps any other name as it is', () => {
    expect(labelFromFileName('Manual_de_Zelda_v2.pdf')).toBe('Manual_de_Zelda_v2');
    expect(labelFromFileName('manual.bin')).toBe('manual.bin');
    expect(labelFromFileName('mapa.pdf.pdf')).toBe('mapa.pdf');
  });

  it('keeps the whole name when only the extension is left', () => {
    expect(labelFromFileName('.pdf')).toBe('.pdf');
  });

  it('always gives a valid name', () => {
    const long = labelFromFileName(`${'a'.repeat(300)}.pdf`);
    expect([...long]).toHaveLength(DOCUMENT_LABEL_MAX_LENGTH);
    expect(cleanDocumentLabel(long)).toBe(long);
    expect(labelFromFileName('  raro\u0007nombre .pdf')).toBe('raro nombre');
  });
});

describe('cleanDocumentLabel', () => {
  it('trims and collapses spaces', () => {
    expect(cleanDocumentLabel('  Guía   oficial ')).toBe('Guía oficial');
  });

  it.each([
    ['an empty name', '', 'media.label_required'],
    ['a name of only spaces', '   ', 'media.label_required'],
    ['a too long name', 'a'.repeat(DOCUMENT_LABEL_MAX_LENGTH + 1), 'media.label_too_long'],
    ['control characters', 'Man\u0000ual', 'media.label_invalid_characters'],
  ])('rejects %s', (_label, raw, code) => {
    expect(codeOf(() => cleanDocumentLabel(raw))).toBe(code);
  });

  it('counts characters as people do', () => {
    const emoji = '📘'.repeat(DOCUMENT_LABEL_MAX_LENGTH);
    expect(cleanDocumentLabel(emoji)).toBe(emoji);
  });
});

describe('fileNameForLabel', () => {
  it('adds the extension to the name', () => {
    expect(fileNameForLabel('Manual de Zelda')).toBe('Manual de Zelda.pdf');
  });

  it('replaces the characters Windows does not allow', () => {
    expect(fileNameForLabel('Guía: parte 1/2 <"final">?*|\\')).toBe(
      'Guía_ parte 1_2 __final______.pdf',
    );
  });

  it('avoids trailing dots and spaces, and the names Windows reserves', () => {
    expect(fileNameForLabel('Notas...')).toBe('Notas.pdf');
    expect(fileNameForLabel('CON')).toBe('_CON.pdf');
    expect(fileNameForLabel('nul.txt')).toBe('_nul.txt.pdf');
    expect(fileNameForLabel('Consola')).toBe('Consola.pdf');
  });

  it('shortens long names and never leaves one empty', () => {
    expect(fileNameForLabel('a'.repeat(200))).toBe(`${'a'.repeat(120)}.pdf`);
    expect(fileNameForLabel('...')).toBe('document.pdf');
  });
});
