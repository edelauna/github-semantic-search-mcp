import { describe, it, expect } from 'vitest';
import { encryptedString, decryptedString } from '../../src/utils/crpyto.utils';

describe('Crypto Utils Integration', () => {
  describe('encryption/decryption cycle', () => {
    it('should successfully encrypt and decrypt a string', async () => {
      const originalMessage = 'test-github-token-123';

      // Encrypt the message
      const encrypted = await encryptedString(originalMessage);
      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toBe(originalMessage);

      // Decrypt the message
      const decrypted = await decryptedString(encrypted);
      expect(decrypted).toBe(originalMessage);
    });

    it('should handle empty strings', async () => {
      const originalMessage = '';

      const encrypted = await encryptedString(originalMessage);
      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');

      const decrypted = await decryptedString(encrypted);
      expect(decrypted).toBe(originalMessage);
    });

    it('should handle special characters', async () => {
      const originalMessage = '!@#$%^&*()_+-=[]{}|;:,.<>?`~';

      const encrypted = await encryptedString(originalMessage);
      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toBe(originalMessage);

      const decrypted = await decryptedString(encrypted);
      expect(decrypted).toBe(originalMessage);
    });

    it('should handle long strings', async () => {
      const originalMessage = 'x'.repeat(190); // test keys algorithm max size is 190 chars

      const encrypted = await encryptedString(originalMessage);
      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toBe(originalMessage);

      const decrypted = await decryptedString(encrypted);
      expect(decrypted).toBe(originalMessage);
    });

    it('should fail to encrypt too large a string', async () => {
      const originalMessage = 'x'.repeat(191);

      await expect(encryptedString(originalMessage)).rejects.toThrow();
    });

    it('should fail to decrypt invalid base64', async () => {
      const invalidEncrypted = 'not-valid-base64!@#';

      await expect(decryptedString(invalidEncrypted)).rejects.toThrow();
    });
  });
});
