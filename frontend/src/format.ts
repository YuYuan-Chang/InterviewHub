export function timeAgo(iso: string): string {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const units: [number, string][] = [
    [31536000, 'y'],
    [2592000, 'mo'],
    [86400, 'd'],
    [3600, 'h'],
    [60, 'm'],
  ];
  for (const [size, label] of units) {
    if (seconds >= size) return `${Math.floor(seconds / size)}${label}`;
  }
  return 'now';
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
}

export const isImage = (mime: string) => mime.startsWith('image/');
export const isVideo = (mime: string) => mime.startsWith('video/');
export const isPdf = (mime: string) => mime === 'application/pdf';

export function docIcon(mime: string): string {
  if (isPdf(mime)) return '📄';
  if (mime.includes('spreadsheet')) return '📊';
  if (mime.includes('word') || mime === 'text/plain' || mime === 'text/markdown') return '📝';
  return '📎';
}
