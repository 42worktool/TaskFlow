import { randomBytes, scrypt, timingSafeEqual } from 'crypto';

const PASSWORD_HASH_PREFIX = 'scrypt-v1';
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_KEY_BYTES = 64;
const SCRYPT_OPTIONS = {
  N: 1 << 14,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};

function derivePasswordKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, PASSWORD_KEY_BYTES, SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(PASSWORD_SALT_BYTES);
  const key = await derivePasswordKey(password, salt);
  return `${PASSWORD_HASH_PREFIX}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, encodedHash: string | null): Promise<boolean> {
  let validEncoding = false;
  let salt = Buffer.alloc(PASSWORD_SALT_BYTES);
  let expectedKey = Buffer.alloc(PASSWORD_KEY_BYTES);

  if (encodedHash) {
    const [prefix, encodedSalt, encodedKey, ...extra] = encodedHash.split('$');
    if (prefix === PASSWORD_HASH_PREFIX && encodedSalt && encodedKey && extra.length === 0) {
      const decodedSalt = Buffer.from(encodedSalt, 'base64url');
      const decodedKey = Buffer.from(encodedKey, 'base64url');
      if (decodedSalt.length === PASSWORD_SALT_BYTES && decodedKey.length === PASSWORD_KEY_BYTES) {
        salt = decodedSalt;
        expectedKey = decodedKey;
        validEncoding = true;
      }
    }
  }

  const actualKey = await derivePasswordKey(password, salt);
  return validEncoding && timingSafeEqual(actualKey, expectedKey);
}

export function safeEqual(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return '/workspaces';
  }

  try {
    const parsed = new URL(value, 'http://local.invalid');
    if (parsed.origin !== 'http://local.invalid') return '/workspaces';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/workspaces';
  }
}
