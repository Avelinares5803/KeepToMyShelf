import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImageStorageChoice } from '../../../core/media/import-rules';
import type { IpcResult } from '../../../shared/ipc';
import type { PickedImports, PreparedImport } from '../../../shared/media';
import type { ImageImportChoice } from '../../../shared/settings';
import { errorMessage, IpcError, unwrap } from '../../lib/ipc';
import { ImageImportDialog, type ImportDecision } from './ImageImportDialog';
import { automaticChoice, preparedImage, type FormImage } from './media-form';

/** The image import preferences of the open profile. */
export interface ImageImportOptions {
  /** Ask, or the choice the user asked to remember. */
  readonly importChoice: ImageImportChoice;
  readonly optimizedMaxSide: number;
  /** "Remember my choice" was ticked: it becomes the profile's preference. */
  readonly onRememberChoice: (choice: ImageStorageChoice) => void;
}

interface UseImageImportProps extends ImageImportOptions {
  token: string;
  /** False for the cover: the file dialog then allows a single image. */
  multiple: boolean;
  /** The chosen images, prepared and with how to keep each one. */
  onAdded: (images: FormImage[]) => void;
}

/**
 * Choosing images in the file dialog (or dropping them on the field) and, unless a choice is
 * remembered, asking how to keep each one in the import window. Images are only prepared:
 * they are saved with the item. Only the cover (`multiple` false) refuses several dropped
 * images at once.
 */
export function useImageImport({
  token,
  multiple,
  importChoice,
  optimizedMaxSide,
  onRememberChoice,
  onAdded,
}: UseImageImportProps): {
  pick: () => Promise<void>;
  /** Prepares images dropped on the field, as if chosen in the file dialog. */
  drop: (files: readonly File[]) => Promise<void>;
  /** True while the chosen files are being prepared or wait for the import window. */
  busy: boolean;
  preparing: boolean;
  problems: string[];
  /** The import window, when an image waits for a choice. */
  dialog: ReactNode;
} {
  const { t } = useTranslation();
  const [preparing, setPreparing] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  // Images chosen together that still wait for the import window.
  const [queue, setQueue] = useState<readonly PreparedImport[]>([]);

  function pick(): Promise<void> {
    return importFrom(() =>
      window.api.media.pickImages({ token, filterName: t('media.images.fileType'), multiple }),
    );
  }

  function drop(files: readonly File[]): Promise<void> {
    if (files.length === 0) {
      setProblems([t('media.drop.notFiles')]);
      return Promise.resolve();
    }
    if (!multiple && files.length > 1) {
      setProblems([t('media.cover.dropOne')]);
      return Promise.resolve();
    }
    return importFrom(() => window.api.media.prepareDropped({ token, expected: 'image', files }));
  }

  /** Prepares the images chosen or dropped; `request` resolves to null if nothing was chosen. */
  async function importFrom(request: () => Promise<IpcResult<PickedImports | null>>) {
    setPreparing(true);
    setProblems([]);
    try {
      const picked = unwrap(await request());
      if (picked === null) return;
      setProblems(
        picked.rejected.map(({ fileName, code }) =>
          t('media.images.rejected', {
            name: fileName,
            reason: errorMessage(t, new IpcError(code, code)),
          }),
        ),
      );
      if (importChoice === 'ask') {
        setQueue(picked.prepared);
      } else {
        onAdded(picked.prepared.map((p) => preparedImage(p, automaticChoice(p, importChoice))));
      }
    } catch (caught) {
      setProblems([errorMessage(t, caught)]);
    } finally {
      setPreparing(false);
    }
  }

  function decide(prepared: PreparedImport, decision: ImportDecision) {
    const [, ...rest] = queue;
    let added = [preparedImage(prepared, decision.choice)];
    if (decision.remember) onRememberChoice(decision.choice);
    if (decision.remember || decision.applyToRest) {
      added = [...added, ...rest.map((p) => preparedImage(p, automaticChoice(p, decision.choice)))];
      setQueue([]);
    } else {
      setQueue(rest);
    }
    onAdded(added);
  }

  function cancel(prepared: PreparedImport) {
    // Only frees temporary files early: they are also dropped when the profile closes.
    void window.api.media.discardImports({ token, preparedIds: [prepared.id] });
    setQueue(queue.slice(1));
  }

  const current = queue[0];
  return {
    pick,
    drop,
    busy: preparing || current !== undefined,
    preparing,
    problems,
    dialog: current !== undefined && (
      <ImageImportDialog
        key={current.id}
        prepared={current}
        remaining={queue.length - 1}
        optimizedMaxSide={optimizedMaxSide}
        onConfirm={(decision) => decide(current, decision)}
        onCancel={() => cancel(current)}
      />
    ),
  };
}
