import { describe, it, expect } from 'vitest';
import { PasswordService } from './PasswordService';

describe('PasswordService', () => {
  describe('isBcrypt', () => {
    it('recognises bcrypt hashes ($2 prefix)', async () => {
      const hash = await PasswordService.hash('pw');
      expect(PasswordService.isBcrypt(hash)).toBe(true);
    });

    it('treats plaintext as non-bcrypt', () => {
      expect(PasswordService.isBcrypt('plaintext')).toBe(false);
      expect(PasswordService.isBcrypt('')).toBe(false);
    });
  });

  describe('hash', () => {
    it('produces a bcrypt hash different from the input', async () => {
      const hash = await PasswordService.hash('hunter2');
      expect(hash).not.toBe('hunter2');
      expect(hash.startsWith('$2')).toBe(true);
    });

    it('produces unique hashes for the same password (random salt)', async () => {
      const a = await PasswordService.hash('samePassword');
      const b = await PasswordService.hash('samePassword');
      expect(a).not.toBe(b);
    });
  });

  describe('verify', () => {
    it('accepts the correct password against a bcrypt hash', async () => {
      const hash = await PasswordService.hash('correct horse');
      expect(await PasswordService.verify('correct horse', hash)).toBe(true);
    });

    it('rejects an incorrect password against a bcrypt hash', async () => {
      const hash = await PasswordService.hash('correct horse');
      expect(await PasswordService.verify('wrong horse', hash)).toBe(false);
    });

    it('supports plaintext fallback for un-migrated passwords', async () => {
      expect(await PasswordService.verify('legacy', 'legacy')).toBe(true);
      expect(await PasswordService.verify('legacy', 'other')).toBe(false);
    });
  });
});
