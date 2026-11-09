import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/** AES-256-GCM. Stored format: v1:<iv>:<tag>:<ciphertext> (all base64). */
export function parseKey(raw: string | undefined): Buffer {
  if (!raw) throw new Error('ENCRYPTION_KEY is not set');
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64)');
  }
  return key;
}

@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor() {
    this.key = parseKey(process.env.ENCRYPTION_KEY);
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
  }

  decrypt(payload: string): string {
    const [version, iv, tag, ct] = payload.split(':');
    if (version !== 'v1' || !iv || !tag || ct === undefined) throw new Error('Invalid ciphertext format');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
  }
}
