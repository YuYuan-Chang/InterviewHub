import { fileContentUrl } from '../api';

const SIZES = { sm: 28, md: 40, lg: 56, xl: 96 } as const;

/** Deterministic hue from the username so every user gets a stable color. */
function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

export function Avatar({
  username,
  displayName,
  fileId,
  size = 'md',
}: {
  username: string;
  displayName?: string;
  /** file-service image id — renders the photo; falls back to initials when absent */
  fileId?: string | null;
  size?: keyof typeof SIZES;
}) {
  const px = SIZES[size];

  if (fileId) {
    return (
      <img
        className="avatar avatar-img"
        style={{ width: px, height: px }}
        src={fileContentUrl(fileId)}
        alt={displayName || username}
      />
    );
  }

  const initials = (displayName || username)
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const hue = hueOf(username);
  return (
    <span
      className="avatar"
      style={{
        width: px,
        height: px,
        fontSize: px * 0.4,
        background: `linear-gradient(135deg, hsl(${hue} 70% 50%), hsl(${(hue + 40) % 360} 70% 42%))`,
      }}
      aria-hidden
    >
      {initials || '?'}
    </span>
  );
}
