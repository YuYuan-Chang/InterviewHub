/** Environment helpers shared by every service (12-factor: config via env only). */

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function envOr(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

/** PEM keys are passed around base64-encoded so they survive env-var plumbing. */
export function decodeB64Env(name: string): string {
  return Buffer.from(requiredEnv(name), 'base64').toString('utf8');
}
