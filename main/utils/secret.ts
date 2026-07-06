import crypto from 'crypto';
import { getSetting, setSetting } from '../database/queries/settings';

// Reversible encryption for app-user passwords. This is an intentional
// local-first design choice: the barangay admin can reveal mobile-app user
// passwords. AES-256-GCM keeps them out of plaintext at rest, but anyone with
// BOTH the database file and the app key could decrypt them — that's inherent
// to "admin can view passwords" and acceptable for an offline single-office app.

function getKey(): Buffer {
  let hex = getSetting('app_user_secret');
  if (!hex) {
    hex = crypto.randomBytes(32).toString('hex');
    setSetting('app_user_secret', hex);
  }
  return Buffer.from(hex, 'hex');
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(blob: string): string {
  try {
    const [ivB64, tagB64, dataB64] = blob.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}
