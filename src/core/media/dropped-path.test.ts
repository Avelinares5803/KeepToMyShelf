import { describe, expect, it } from 'vitest';
import { droppedPathProblem } from './dropped-path';

describe('droppedPathProblem', () => {
  it.each(['C:\\Users\\Adrián\\Imágenes\\caja.png', 'd:/juegos/manual.pdf', '/home/ana/caja.png'])(
    'accepts the local path %s',
    (path) => {
      expect(droppedPathProblem(path)).toBeNull();
    },
  );

  it.each([
    '\\\\servidor\\compartida\\caja.png',
    '//servidor/compartida/caja.png',
    '\\/servidor\\caja.png',
    '\\\\?\\UNC\\servidor\\compartida\\caja.png',
    '\\\\?\\C:\\caja.png',
    '\\\\.\\PhysicalDrive0',
  ])('refuses the network or device path %s', (path) => {
    expect(droppedPathProblem(path)).toBe('media.network_path');
  });

  it.each(['', 'caja.png', '.\\caja.png', 'C:caja.png', 'https://example.com/caja.png'])(
    'refuses %j, which is not a file on disk',
    (path) => {
      expect(droppedPathProblem(path)).toBe('media.not_on_disk');
    },
  );
});
