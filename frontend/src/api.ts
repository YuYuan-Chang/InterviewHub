interface Tokens {
  accessToken: string;
  refreshToken: string;
}

const STORAGE_KEY = 'interviewhub.tokens';

export function getTokens(): Tokens | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Tokens) : null;
}

export function setTokens(tokens: Tokens | null): void {
  if (tokens) localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  else localStorage.removeItem(STORAGE_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function refreshTokens(): Promise<boolean> {
  const tokens = getTokens();
  if (!tokens) return false;
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  });
  if (!res.ok) {
    setTokens(null);
    return false;
  }
  const data = (await res.json()) as Tokens;
  setTokens(data);
  return true;
}

interface ApiOptions {
  method?: string;
  body?: unknown;
  formData?: FormData;
}

export async function api<T>(path: string, opts: ApiOptions = {}, retried = false): Promise<T> {
  const tokens = getTokens();
  const headers: Record<string, string> = {};
  if (tokens) headers.authorization = `Bearer ${tokens.accessToken}`;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';

  const res = await fetch(path, {
    method: opts.method ?? (opts.body !== undefined || opts.formData ? 'POST' : 'GET'),
    headers,
    body: opts.formData ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });

  if (res.status === 401 && tokens && !retried && !path.startsWith('/api/auth/')) {
    if (await refreshTokens()) return api<T>(path, opts, true);
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Public inline URL for rendering media in <img>/<video>/pdf.js. */
export function fileContentUrl(fileId: string): string {
  return `/api/files/${fileId}/content`;
}

export interface UploadedFile {
  id: string;
  name: string;
  mime: string;
  sizeBytes: number;
}

export interface UploadHandle {
  promise: Promise<UploadedFile>;
  abort(): void;
}

/** XHR-based upload: fetch() has no upload-progress events, XHR does. */
export function uploadWithProgress(file: File, onProgress: (pct: number) => void): UploadHandle {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<UploadedFile>((resolve, reject) => {
    const tokens = getTokens();
    xhr.open('POST', '/api/files');
    if (tokens) xhr.setRequestHeader('authorization', `Bearer ${tokens.accessToken}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status === 201) {
        resolve(JSON.parse(xhr.responseText) as UploadedFile);
      } else {
        let message = `Upload failed (${xhr.status})`;
        try {
          message = (JSON.parse(xhr.responseText) as { error?: string }).error ?? message;
        } catch {
          /* non-JSON body */
        }
        reject(new ApiError(xhr.status, message));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, 'Network error during upload'));
    xhr.onabort = () => reject(new ApiError(0, 'Upload cancelled'));
    const fd = new FormData();
    fd.append('file', file);
    xhr.send(fd);
  });
  return { promise, abort: () => xhr.abort() };
}

/** Authenticated file download that preserves the token (plain <a href> would not). */
export async function downloadFile(fileId: string, fileName: string): Promise<void> {
  const tokens = getTokens();
  const res = await fetch(`/api/files/${fileId}/download`, {
    headers: tokens ? { authorization: `Bearer ${tokens.accessToken}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, 'Download failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
