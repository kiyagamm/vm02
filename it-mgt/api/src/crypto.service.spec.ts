import { CryptoService } from './crypto.service';

const KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

describe('CryptoService', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = KEY;
  });

  it('round-trips and uses random IVs', () => {
    const c = new CryptoService();
    const a = c.encrypt('s3cret!');
    const b = c.encrypt('s3cret!');
    expect(a).not.toEqual(b);
    expect(a).not.toContain('s3cret!');
    expect(c.decrypt(a)).toBe('s3cret!');
  });

  it('round-trips an empty password', () => {
    const c = new CryptoService();
    expect(c.decrypt(c.encrypt(''))).toBe('');
  });

  it('detects tampering', () => {
    const c = new CryptoService();
    const parts = c.encrypt('abc').split(':');
    parts[3] = Buffer.from('zzz').toString('base64');
    expect(() => c.decrypt(parts.join(':'))).toThrow();
  });

  it('rejects bad keys', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => new CryptoService()).toThrow();
    process.env.ENCRYPTION_KEY = 'short';
    expect(() => new CryptoService()).toThrow();
  });
});
