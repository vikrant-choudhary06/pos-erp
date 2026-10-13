import crypto from 'node:crypto';

export interface Protection {
  encrypt(plain: string): Buffer;
  decrypt(cipher: Buffer): string;
}

/** Headless installations supply this key from their external secret store. */
export function keyProtection(encoded: string | undefined): Protection {
  const key = Buffer.from(encoded ?? '', 'base64');
  if (key.length !== 32)
    throw new Error('RIZZOTO_HUB_KEY must contain a base64-encoded 32-byte key');
  return {
    encrypt(plain) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const bytes = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), bytes]);
    },
    decrypt(bytes) {
      if (bytes.length < 28) throw new Error('Invalid encrypted hub data');
      const cipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      cipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8');
    },
  };
}
