import { useRef, useState } from 'react';
import { uploadWithProgress, type UploadHandle } from '../api';
import { docIcon, formatBytes, isImage, isVideo } from '../format';

const MAX_FILES = 8;
const MAX_BYTES = 10 * 1024 * 1024;
export const ACCEPT =
  '.pdf,.txt,.md,.doc,.docx,.xlsx,.jpg,.jpeg,.png,.gif,.webp,.mp4,.mov';

export interface PendingFile {
  key: string;
  file: File;
  previewUrl: string;
  progress: number; // 0-100
  fileId?: string; // set once the server upload finishes
  error?: string;
  handle?: UploadHandle;
}

/** Manages instant previews + immediate background uploads for the composer. */
export function useUploads() {
  const [items, setItems] = useState<PendingFile[]>([]);
  const counter = useRef(0);

  function patch(key: string, changes: Partial<PendingFile>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...changes } : it)));
  }

  function addFiles(files: FileList | File[]) {
    const incoming = [...files];
    setItems((prev) => {
      const room = MAX_FILES - prev.length;
      const accepted = incoming.slice(0, Math.max(0, room));
      const added: PendingFile[] = accepted.map((file) => {
        const key = `f${counter.current++}`;
        const item: PendingFile = {
          key,
          file,
          previewUrl: URL.createObjectURL(file),
          progress: 0,
        };
        if (file.size > MAX_BYTES) {
          item.error = 'Over 10MB';
        } else {
          // upload starts immediately — the preview is already visible
          const handle = uploadWithProgress(file, (pct) => patch(key, { progress: pct }));
          item.handle = handle;
          handle.promise
            .then((uploaded) => patch(key, { fileId: uploaded.id, progress: 100 }))
            .catch((err: Error) => {
              if (err.message !== 'Upload cancelled') patch(key, { error: err.message });
            });
        }
        return item;
      });
      return [...prev, ...added];
    });
  }

  function remove(key: string) {
    setItems((prev) => {
      const item = prev.find((it) => it.key === key);
      if (item) {
        item.handle?.abort();
        URL.revokeObjectURL(item.previewUrl);
      }
      return prev.filter((it) => it.key !== key);
    });
  }

  const uploading = items.some((it) => !it.fileId && !it.error);
  const hasErrors = items.some((it) => !!it.error);
  const fileIds = items.filter((it) => it.fileId).map((it) => it.fileId!);
  return { items, addFiles, remove, uploading, hasErrors, fileIds, full: items.length >= MAX_FILES };
}

function TilePreview({ item }: { item: PendingFile }) {
  if (isImage(item.file.type)) return <img src={item.previewUrl} alt={item.file.name} />;
  if (isVideo(item.file.type)) return <video src={item.previewUrl} muted playsInline preload="metadata" />;
  return (
    <span className="doc-tile as-preview">
      <span className="doc-icon">{docIcon(item.file.type)}</span>
      <span className="doc-meta">
        <span className="doc-name">{item.file.name}</span>
        <span className="post-meta-inline">{formatBytes(item.file.size)}</span>
      </span>
    </span>
  );
}

export function UploadTray({ items, onRemove }: { items: PendingFile[]; onRemove: (key: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className={`media-grid media-${Math.min(items.length, 4)} upload-tray`}>
      {items.map((item) => (
        <div className={`media-tile ${item.error ? 'tile-error' : ''}`} key={item.key}>
          <TilePreview item={item} />
          {!item.fileId && !item.error && (
            <span className="progress-overlay" aria-label={`Uploading ${item.progress}%`}>
              <span className="progress-fill" style={{ width: `${item.progress}%` }} />
            </span>
          )}
          {item.error && <span className="error-overlay">{item.error}</span>}
          <button
            type="button"
            className="tile-remove"
            onClick={() => onRemove(item.key)}
            aria-label={`Remove ${item.file.name}`}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
