import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImageStorageChoice } from '../../../core/media/import-rules';
import type { ImportedBackground } from '../../../shared/backgrounds';
import type { PreparedImport } from '../../../shared/media';
import type { ImageImportChoice } from '../../../shared/settings';
import { errorMessage, IpcError, unwrap } from '../../lib/ipc';
import { ImageImportDialog, type ImportDecision } from '../media/ImageImportDialog';
import { automaticChoice } from '../media/media-form';

interface UseBackgroundImportProps {
  /** The open profile, whose optimized size applies; null on the profile selection. */
  token: string | null;
  /** Ask, or the choice the user asked to remember for backgrounds. */
  importChoice: ImageImportChoice;
  optimizedMaxSide: number;
  /** "Remember my choice" was ticked: it becomes the backgrounds' import preference. */
  onRememberChoice: (choice: ImageStorageChoice) => void;
  /** Backgrounds added to the gallery, in the order they were chosen. */
  onImported: (backgrounds: ImportedBackground[]) => void;
}

/**
 * Choosing images in the file dialog and, unless a choice is remembered, asking how to keep
 * each one in the import window. Unlike covers, there is no draft: each image goes to the
 * common gallery as soon as its choice is made.
 */
export function useBackgroundImport({
  token,
  importChoice,
  optimizedMaxSide,
  onRememberChoice,
  onImported,
}: UseBackgroundImportProps): {
  pick: () => Promise<void>;
  /** True while the chosen files are being prepared, wait for the import window or are saved. */
  busy: boolean;
  preparing: boolean;
  problems: string[];
  /** The import window, when an image waits for a choice. */
  dialog: ReactNode;
} {
  const { t } = useTranslation();
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  // Images chosen together that still wait for the import window.
  const [queue, setQueue] = useState<readonly PreparedImport[]>([]);

  /** Adds them to the gallery one after another; a failure is reported and stops the rest. */
  async function save(entries: readonly (readonly [PreparedImport, ImageStorageChoice])[]) {
    if (entries.length === 0) return;
    setSaving(true);
    const added: ImportedBackground[] = [];
    try {
      for (const [prepared, choice] of entries) {
        added.push(
          unwrap(await window.api.backgrounds.import({ preparedId: prepared.id, choice })),
        );
      }
    } catch (caught) {
      setProblems((current) => [...current, errorMessage(t, caught)]);
    } finally {
      setSaving(false);
      if (added.length > 0) onImported(added);
    }
  }

  async function pick() {
    setPreparing(true);
    setProblems([]);
    try {
      const picked = unwrap(
        await window.api.backgrounds.pick({ token, filterName: t('background.fileType') }),
      );
      if (picked === null) return;
      setProblems(
        picked.rejected.map(({ fileName, code }) =>
          t('background.rejected', {
            name: fileName,
            reason: errorMessage(t, new IpcError(code, code)),
          }),
        ),
      );
      if (importChoice === 'ask') {
        setQueue(picked.prepared);
      } else {
        await save(picked.prepared.map((p) => [p, automaticChoice(p, importChoice)] as const));
      }
    } catch (caught) {
      setProblems([errorMessage(t, caught)]);
    } finally {
      setPreparing(false);
    }
  }

  function decide(prepared: PreparedImport, decision: ImportDecision) {
    const [, ...rest] = queue;
    let entries = [[prepared, decision.choice] as const];
    if (decision.remember) onRememberChoice(decision.choice);
    if (decision.remember || decision.applyToRest) {
      entries = [...entries, ...rest.map((p) => [p, automaticChoice(p, decision.choice)] as const)];
      setQueue([]);
    } else {
      setQueue(rest);
    }
    void save(entries);
  }

  function cancel(prepared: PreparedImport) {
    // Only frees temporary files early: they are also dropped when the app starts.
    void window.api.backgrounds.discardImports({ preparedIds: [prepared.id] });
    setQueue(queue.slice(1));
  }

  const current = queue[0];
  return {
    pick,
    busy: preparing || saving || current !== undefined,
    preparing: preparing || saving,
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
