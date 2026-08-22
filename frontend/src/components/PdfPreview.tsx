import { useEffect, useId, useRef } from 'react';
import { downloadFile, fileContentUrl } from '../api';
import { formatBytes } from '../format';
import type { Attachment } from '../types';

export function PdfPreview({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  onCloseRef.current = onClose;

  function requestClose() {
    if (dialogRef.current?.open) dialogRef.current.close();
    onClose();
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (dialog?.open) dialog.close();
      onCloseRef.current();
    }

    if (dialog && !dialog.open) dialog.showModal();
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="pdf-preview"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div className="pdf-preview-dialog">
        <header className="pdf-preview-header">
          <div className="pdf-preview-heading">
            <strong id={titleId}>{attachment.name}</strong>
            <span>{formatBytes(attachment.sizeBytes)}</span>
          </div>
          <div className="pdf-preview-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void downloadFile(attachment.fileId, attachment.name)}
            >
              Download
            </button>
            <button
              type="button"
              className="pdf-preview-close"
              onClick={requestClose}
              aria-label="Close preview"
              autoFocus
            >
              ✕
            </button>
          </div>
        </header>
        <iframe
          className="pdf-preview-frame"
          src={`${fileContentUrl(attachment.fileId)}#view=FitH`}
          title={`Preview ${attachment.name}`}
        />
      </div>
    </dialog>
  );
}
