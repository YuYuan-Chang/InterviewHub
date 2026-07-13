import { useState } from 'react';
import { downloadFile, fileContentUrl } from '../api';
import { docIcon, formatBytes, isImage, isPdf, isVideo } from '../format';
import { Lightbox } from './Lightbox';
import { PdfThumb } from './PdfThumb';
import type { Attachment } from '../types';

function VideoTile({ attachment }: { attachment: Attachment }) {
  const [playing, setPlaying] = useState(false);
  if (playing) {
    return <video src={fileContentUrl(attachment.fileId)} controls autoPlay playsInline />;
  }
  return (
    <button className="tile-btn" onClick={() => setPlaying(true)} aria-label={`Play ${attachment.name}`}>
      <video src={fileContentUrl(attachment.fileId)} preload="metadata" muted playsInline />
      <span className="play-overlay">▶</span>
    </button>
  );
}

function DocTile({ attachment }: { attachment: Attachment }) {
  return (
    <button
      className="tile-btn doc-tile"
      onClick={() => downloadFile(attachment.fileId, attachment.name)}
      title={`Download ${attachment.name}`}
    >
      {isPdf(attachment.mime) ? (
        <PdfThumb fileId={attachment.fileId} />
      ) : (
        <span className="doc-icon">{docIcon(attachment.mime)}</span>
      )}
      <span className="doc-meta">
        <span className="doc-name">{attachment.name}</span>
        <span className="post-meta-inline">{formatBytes(attachment.sizeBytes)}</span>
      </span>
    </button>
  );
}

/**
 * Twitter-style media grid: 1 tile full width, 2 side by side, 3 with the
 * first spanning both rows, 4+ as a 2×2 with a "+N" overlay on the last tile.
 */
export function AttachmentGrid({ attachments }: { attachments: Attachment[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);

  if (!attachments || attachments.length === 0) return null;

  const images = attachments.filter((a) => isImage(a.mime));
  const shown = expanded ? attachments : attachments.slice(0, 4);
  const hidden = attachments.length - shown.length;

  function tileFor(a: Attachment) {
    if (isImage(a.mime)) {
      const imageIndex = images.findIndex((i) => i.fileId === a.fileId);
      return (
        <button className="tile-btn" onClick={() => setLightboxIndex(imageIndex)} aria-label={`View ${a.name}`}>
          <img src={fileContentUrl(a.fileId)} alt={a.name} loading="lazy" />
        </button>
      );
    }
    if (isVideo(a.mime)) return <VideoTile attachment={a} />;
    return <DocTile attachment={a} />;
  }

  return (
    <>
      <div className={`media-grid media-${Math.min(shown.length, 4)}`}>
        {shown.map((a, i) => (
          <div className="media-tile" key={a.fileId}>
            {tileFor(a)}
            {hidden > 0 && i === shown.length - 1 && (
              <button className="more-overlay" onClick={() => setExpanded(true)}>
                +{hidden}
              </button>
            )}
          </div>
        ))}
      </div>
      {lightboxIndex !== null && (
        <Lightbox
          images={images}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNav={setLightboxIndex}
        />
      )}
    </>
  );
}
