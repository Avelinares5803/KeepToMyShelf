/**
 * Reads a CSV text character by character (RFC 4180), on its own: it shares no code with the app,
 * so it checks what the app writes.
 */
export function parseCsv(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char !== '"') cell += char;
      else if (text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === separator) {
      row.push(cell);
      cell = '';
    } else if (char === '\r' && text[i + 1] === '\n') {
      i++;
      rows.push([...row, cell]);
      row = [];
      cell = '';
    } else cell += char;
  }
  if (quoted || cell !== '' || row.length > 0) throw new Error('The CSV text is cut short');
  return rows;
}
