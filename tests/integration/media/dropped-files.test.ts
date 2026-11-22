import { mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../../../src/core/errors';
import { PDF_BYTES, pngImage, writeFile } from '../../support/media-files';
import { createProfileFixture, type ProfileFixture } from '../../support/profile-fixture';

describe('preparing files dropped on the window', () => {
  let fx: ProfileFixture;
  let token: string;

  beforeEach(() => {
    fx = createProfileFixture();
    const profileId = fx.profiles.create({ name: 'Ana' }).profile.id;
    token = fx.sessions.open(profileId).token;
  });

  afterEach(() => {
    fx.cleanup();
  });

  const dropped = (path: string, name = 'ignorado.png') => ({ name, path });

  it('prepares local files of the expected kind, like the file dialog', async () => {
    const image = writeFile(fx.scratchDir, 'Carátula.png', await pngImage(30, 20));
    const document = writeFile(fx.scratchDir, 'Manual.pdf', PDF_BYTES);

    const result = await fx.media.prepareDropped(
      token,
      [dropped(image), dropped(document)],
      'image',
    );

    expect(result.prepared.map((p) => [p.fileName, p.kind])).toEqual([['Carátula.png', 'image']]);
    // Named after the file on disk, not after the name the page gave.
    expect(result.rejected).toEqual([{ fileName: 'Manual.pdf', code: 'media.not_an_image' }]);
  });

  it('refuses, without reading them, files that are not ordinary files on this computer', async () => {
    const folder = join(fx.scratchDir, 'Capturas');
    mkdirSync(folder);
    // A junction needs no administrator rights on Windows, unlike a symbolic link.
    const link = join(fx.scratchDir, 'Enlace');
    symlinkSync(folder, link, 'junction');

    const result = await fx.media.prepareDropped(
      token,
      [
        dropped('', 'desde-el-navegador.png'),
        dropped('\\\\servidor\\compartida\\caja.png'),
        dropped('//servidor/compartida/caja.png'),
        dropped(folder),
        dropped(link),
        dropped(join(fx.scratchDir, 'no-existe.png')),
      ],
      'image',
    );

    expect(result.prepared).toEqual([]);
    expect(result.rejected).toEqual([
      { fileName: 'desde-el-navegador.png', code: 'media.not_on_disk' },
      { fileName: 'caja.png', code: 'media.network_path' },
      { fileName: 'caja.png', code: 'media.network_path' },
      { fileName: 'Capturas', code: 'media.not_a_regular_file' },
      { fileName: 'Enlace', code: 'media.not_a_regular_file' },
      { fileName: 'no-existe.png', code: 'media.source_unreadable' },
    ]);
  });

  it('only prepares PDFs where documents are dropped', async () => {
    const result = await fx.media.prepareDropped(
      token,
      [
        dropped(writeFile(fx.scratchDir, 'Manual.pdf', PDF_BYTES)),
        dropped(writeFile(fx.scratchDir, 'foto.png', await pngImage(10, 10))),
      ],
      'document',
    );

    expect(result.prepared.map((p) => p.fileName)).toEqual(['Manual.pdf']);
    expect(result.rejected).toEqual([{ fileName: 'foto.png', code: 'media.not_a_document' }]);
  });

  it('reports a closed profile once, instead of refusing every file', async () => {
    fx.sessions.close(token);

    await expect(
      fx.media.prepareDropped(token, [dropped('', 'web.png')], 'image'),
    ).rejects.toSatisfy((error) => error instanceof AppError && error.code === 'session.stale');
  });
});
