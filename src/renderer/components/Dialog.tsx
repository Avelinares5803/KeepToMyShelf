import { useEffect, useId, useRef, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Modal dialog built on the native <dialog> element, which traps focus while open
 * and closes with Escape. A dialog opened inside another one (e.g. the image import window
 * over a collection's window) closes alone.
 */
export function Dialog({ open, title, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      // The browser does not pass "close" on to outer elements, but React does: a dialog
      // inside this one would close this one too.
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <h2 id={titleId} className="dialog__title">
        {title}
      </h2>
      {children}
    </dialog>
  );
}
