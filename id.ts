import { randomBytes } from 'crypto';

/** Short unique id — no external deps */
export function uid(len = 16): string {
  return randomBytes(Math.ceil(len * 0.75))
    .toString('base64url')
    .slice(0, len);
}
