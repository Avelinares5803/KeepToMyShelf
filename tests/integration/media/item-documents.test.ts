import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../../../src/core/errors';
import { EMPTY_ITEM_DRAFT, type ItemDraft } from '../../../src/core/items/item-draft';
import type { DocumentPlanEntry, PreparedImport } from '../../../src/shared/media';
import { PDF_BYTES, pngImage, writeFile } from '../../support/media-files';
import { createProfileFixture, type ProfileFixture } from '../../support/profile-fixture';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const draft = (title: string): ItemDraft => ({ ...EMPTY_ITEM_DRAFT, title });
/** A small PDF with its own bytes, so each one is a different file. */
const pdf = (text: string) => Buffer.from(`%PDF-1.7\n% ${text}\n%%EOF\n`);

async function expectCode(run: () => unknown, code: string): Promise<void> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return;
  }
  expect.fail(`Expected error "${code}"`);
}

describe('saving an item with its documents', () => {
  let fx: ProfileFixture;
  let token: string;
  let profileId: string;

  const storedFiles = (): string[] => {
    const folder = join(fx.paths.mediaDir(profileId), 'files');
    return existsSync(folder)
      ? (readdirSync(folder, { recursive: true }) as string[])
          .filter((path) => statSync(join(folder, path)).isFile())
          .map((path) => basename(path))
          .sort()
      : [];
  };
  const prepare = (name: string, bytes: Uint8Array): Promise<PreparedImport> =>
    fx.media.prepareImport(token, writeFile(fx.scratchDir, name, bytes));
  const prepared = (preparation: PreparedImport, label: string): DocumentPlanEntry => ({
    kind: 'prepared',
    preparedId: preparation.id,
    label,
  });
  const existing = (mediaId: number, label: string): DocumentPlanEntry => ({
    kind: 'existing',
    mediaId,
    label,
  });
  const documentsOf = (itemId: number) => fx.media.list(token, itemId).documents;

  beforeEach(() => {
    fx = createProfileFixture();
    profileId = fx.profiles.create({ name: 'Ana' }).profile.id;
    token = fx.sessions.open(profileId).token;
  });

  afterEach(() => {
    fx.cleanup();
  });

  it('saves the documents as they are, in order and with their names', async () => {
    const manual = pdf('manual');
    const item = fx.items.create(token, 'game', draft('Chrono Trigger'), {
      documents: [
        prepared(await prepare('guia.pdf', pdf('guía')), '  Guía   oficial '),
        prepared(await prepare('SLUS-01234.pdf', manual), 'Manual (EE. UU.)'),
      ],
    });

    expect(documentsOf(item.id)).toMatchObject([
      { label: 'Guía oficial', format: 'pdf', isMissing: false },
      { label: 'Manual (EE. UU.)', sha256: sha256(manual), byteSize: manual.length },
    ]);
    expect(storedFiles()).toHaveLength(2);
    expect(storedFiles()).toContain(`${sha256(manual)}.pdf`);
    // The imports were used up: they cannot be saved again.
    expect(readdirSync(join(fx.paths.mediaDir(profileId), '.tmp'))).toEqual([]);
  });

  it('renames, reorders and removes documents, deleting the files nothing uses', async () => {
    const item = fx.items.create(token, 'game', draft('Chrono Trigger'), {
      documents: [
        prepared(await prepare('a.pdf', pdf('a')), 'Manual'),
        prepared(await prepare('b.pdf', pdf('b')), 'Mapa'),
      ],
    });
    const [manual, map] = documentsOf(item.id);

    fx.items.update(token, item.id, draft('Chrono Trigger'), {
      documents: [existing(map!.mediaId, 'Mapa del mundo')],
    });

    expect(documentsOf(item.id)).toMatchObject([
      { mediaId: map!.mediaId, label: 'Mapa del mundo' },
    ]);
    expect(storedFiles()).toEqual([`${map!.sha256}.pdf`]);
    expect(storedFiles()).not.toContain(`${manual!.sha256}.pdf`);
  });

  it('stores a PDF once even when several items use it, each with its own name', async () => {
    const first = fx.items.create(token, 'game', draft('Uno'), {
      documents: [prepared(await prepare('m.pdf', PDF_BYTES), 'Manual')],
    });
    const second = fx.items.create(token, 'game', draft('Dos'), {
      documents: [prepared(await prepare('m.pdf', PDF_BYTES), 'Instrucciones')],
    });

    expect(documentsOf(first.id)[0]!.mediaId).toBe(documentsOf(second.id)[0]!.mediaId);
    expect(documentsOf(second.id)[0]!.label).toBe('Instrucciones');
    expect(storedFiles()).toHaveLength(1);

    fx.items.update(token, first.id, draft('Uno'), { documents: [] });
    expect(storedFiles()).toHaveLength(1);
  });

  it('keeps the documents when the images change, and the images when the documents do', async () => {
    const image = await pngImage(30, 20);
    const item = fx.items.create(token, 'game', draft('Chrono Trigger'), {
      cover: {
        kind: 'prepared',
        preparedId: (await prepare('caja.png', image)).id,
        choice: 'original',
      },
      documents: [prepared(await prepare('m.pdf', PDF_BYTES), 'Manual')],
    });

    fx.items.update(token, item.id, draft('Chrono Trigger'), { images: [] });
    expect(documentsOf(item.id)).toHaveLength(1);
    fx.items.update(token, item.id, draft('Chrono Trigger'), { documents: [] });
    expect(fx.media.list(token, item.id).cover?.sha256).toBe(sha256(image));
  });

  it.each([
    ['an empty name', '  ', 'media.label_required'],
    ['a too long name', 'a'.repeat(201), 'media.label_too_long'],
    ['control characters', 'Man\u0000ual', 'media.label_invalid_characters'],
  ])('saves nothing with %s, and the imports can be used again', async (_label, name, code) => {
    const item = fx.items.create(token, 'game', draft('Chrono Trigger'));
    const cover = await prepare('caja.png', await pngImage(30, 20));
    const manual = await prepare('m.pdf', PDF_BYTES);

    await expectCode(
      () =>
        fx.items.update(token, item.id, draft('Chrono Trigger'), {
          cover: { kind: 'prepared', preparedId: cover.id, choice: 'original' },
          documents: [prepared(manual, name)],
        }),
      code,
    );

    expect(documentsOf(item.id)).toEqual([]);
    // The cover was copied before the document was refused: it is removed again.
    expect(storedFiles()).toEqual([]);
    fx.items.update(token, item.id, draft('Chrono Trigger'), {
      documents: [prepared(manual, 'Manual')],
    });
    expect(documentsOf(item.id)).toHaveLength(1);
  });

  it.each([
    ['the same document twice', 'media.already_attached'],
    ['a document of another item', 'media.not_attached'],
    ['an image', 'media.not_a_document'],
  ])('refuses a list with %s', async (label, code) => {
    const other = fx.items.create(token, 'game', draft('Otro'), {
      documents: [prepared(await prepare('otro.pdf', pdf('otro')), 'Otro')],
    });
    const item = fx.items.create(token, 'game', draft('Chrono Trigger'), {
      documents: [prepared(await prepare('m.pdf', PDF_BYTES), 'Manual')],
    });
    const [mine] = documentsOf(item.id);

    const plans: Record<string, () => Promise<DocumentPlanEntry[]>> = {
      'the same document twice': async () => [
        existing(mine!.mediaId, 'Uno'),
        existing(mine!.mediaId, 'Dos'),
      ],
      'a document of another item': async () => [
        existing(documentsOf(other.id)[0]!.mediaId, 'Ajeno'),
      ],
      'an image': async () => [prepared(await prepare('foto.png', await pngImage(10, 10)), 'Foto')],
    };
    const plan = await plans[label]!();

    await expectCode(
      () => fx.items.update(token, item.id, draft('Chrono Trigger'), { documents: plan }),
      code,
    );
    expect(documentsOf(item.id)).toMatchObject([{ mediaId: mine!.mediaId, label: 'Manual' }]);
  });

  it('only prepares PDFs from the documents dialog', async () => {
    const result = await fx.media.prepareMany(
      token,
      [
        writeFile(fx.scratchDir, 'Manual.pdf', PDF_BYTES),
        writeFile(fx.scratchDir, 'foto.png', await pngImage(10, 10)),
      ],
      'document',
    );

    expect(result.prepared.map((p) => p.fileName)).toEqual(['Manual.pdf']);
    expect(result.rejected).toEqual([{ fileName: 'foto.png', code: 'media.not_a_document' }]);
  });

  it('applies the PDF size limit chosen in the profile settings', async () => {
    fx.settings.setForProfile(profileId, { key: 'maxDocumentMegabytes', value: 50 });
    const limit = 50 * 1024 * 1024;
    const large = Buffer.alloc(limit + 1, 0x20);
    PDF_BYTES.copy(large);

    await expectCode(() => prepare('grande.pdf', large), 'media.too_large');
    await expect(prepare('justo.pdf', large.subarray(0, limit))).resolves.toMatchObject({
      kind: 'document',
    });
  });
});

describe('opening a document', () => {
  let fx: ProfileFixture;
  let token: string;
  let profileId: string;
  let itemId: number;
  let manualId: number;

  const storedPath = (bytes: Uint8Array) => {
    const sha = sha256(bytes);
    return join(fx.paths.mediaDir(profileId), 'files', sha.slice(0, 2), `${sha}.pdf`);
  };

  beforeEach(async () => {
    fx = createProfileFixture();
    profileId = fx.profiles.create({ name: 'Ana' }).profile.id;
    token = fx.sessions.open(profileId).token;
    const preparation = await fx.media.prepareImport(
      token,
      writeFile(fx.scratchDir, 'SLUS-01234.pdf', PDF_BYTES),
    );
    itemId = fx.items.create(token, 'game', draft('Chrono Trigger'), {
      documents: [{ kind: 'prepared', preparedId: preparation.id, label: 'Manual: parte 1/2' }],
    }).id;
    manualId = fx.media.list(token, itemId).documents[0]!.mediaId;
  });

  afterEach(() => {
    fx.cleanup();
  });

  it('opens a copy named after the document, so the stored file never changes', async () => {
    await fx.media.openDocument(token, itemId, manualId);

    expect(fx.openedFiles).toHaveLength(1);
    const [opened] = fx.openedFiles;
    expect(basename(opened!)).toBe('Manual_ parte 1_2.pdf');
    expect(dirname(dirname(opened!))).toBe(fx.openedDocumentsDir);
    expect(readFileSync(opened!).equals(PDF_BYTES)).toBe(true);

    // The viewer saves annotations into the copy: the stored file keeps its bytes.
    writeFileSync(opened!, 'anotado');
    expect(readFileSync(storedPath(PDF_BYTES)).equals(PDF_BYTES)).toBe(true);
  });

  it('opens each time in its own folder', async () => {
    await fx.media.openDocument(token, itemId, manualId);
    await fx.media.openDocument(token, itemId, manualId);

    const [first, second] = fx.openedFiles;
    expect(basename(first!)).toBe(basename(second!));
    expect(dirname(first!)).not.toBe(dirname(second!));
  });

  it('tells when the system viewer cannot open it', async () => {
    fx.setViewerAnswer('No application is associated with the specified file');
    await expectCode(() => fx.media.openDocument(token, itemId, manualId), 'media.open_failed');
  });

  it('tells when the stored file was deleted by hand, without opening anything', async () => {
    rmSync(storedPath(PDF_BYTES));
    await expectCode(() => fx.media.openDocument(token, itemId, manualId), 'media.file_missing');
    expect(fx.openedFiles).toEqual([]);
  });

  it('only opens documents of that item, and never an image', async () => {
    const other = fx.items.create(token, 'game', draft('Otro')).id;
    await expectCode(() => fx.media.openDocument(token, other, manualId), 'media.not_attached');

    const cover = await fx.media.prepareImport(
      token,
      writeFile(fx.scratchDir, 'caja.png', await pngImage(10, 10)),
    );
    fx.items.update(token, itemId, draft('Chrono Trigger'), {
      cover: { kind: 'prepared', preparedId: cover.id, choice: 'original' },
      images: [{ kind: 'prepared', preparedId: cover.id, choice: 'original' }],
    });
    const imageId = fx.media.list(token, itemId).images[0]!.mediaId;
    await expectCode(() => fx.media.openDocument(token, itemId, imageId), 'media.not_attached');
    expect(fx.openedFiles).toEqual([]);
  });

  it('removes the opened copies when the profile closes', async () => {
    await fx.media.openDocument(token, itemId, manualId);
    expect(readdirSync(fx.openedDocumentsDir)).toHaveLength(1);

    fx.sessions.closeCurrent();

    expect(readdirSync(fx.openedDocumentsDir)).toEqual([]);
  });
});
