import { useEffect, useId, useRef, type ReactNode } from 'react';

export function Dialog({ title, children, onClose, busy = false }: {
  title: string;
  children: ReactNode;
  onClose(): void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog ref={ref} className="library-dialog" aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <div className="library-dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="btn btn-ghost" aria-label="Close dialog" disabled={busy} onClick={onClose}>×</button>
      </div>
      {children}
    </dialog>
  );
}
