import { useEffect } from 'react';
import { fileContentUrl } from '../api';
import type { Attachment } from '../types';

export function Lightbox({
  images,
  index,
  onClose,
  onNav,
}: {
  images: Attachment[];
  index: number;
  onClose: () => void;
  onNav: (next: number) => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && index < images.length - 1) onNav(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onNav(index - 1);
    }
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [index, images.length, onClose, onNav]);

  const image = images[index];
  if (!image) return null;

  return (
    <div className="lightbox" onClick={onClose} role="dialog" aria-label={image.name}>
      <button className="lightbox-close" onClick={onClose} aria-label="Close">
        ✕
      </button>
      {index > 0 && (
        <button
          className="lightbox-nav lightbox-prev"
          onClick={(e) => {
            e.stopPropagation();
            onNav(index - 1);
          }}
          aria-label="Previous image"
        >
          ‹
        </button>
      )}
      <img src={fileContentUrl(image.fileId)} alt={image.name} onClick={(e) => e.stopPropagation()} />
      {index < images.length - 1 && (
        <button
          className="lightbox-nav lightbox-next"
          onClick={(e) => {
            e.stopPropagation();
            onNav(index + 1);
          }}
          aria-label="Next image"
        >
          ›
        </button>
      )}
    </div>
  );
}
