import { describe, it, expect, beforeAll } from 'vitest';
import { encryptedString, decryptedString } from '../../src/utils/crpyto.utils';
import { env } from 'cloudflare:test';

describe('Crypto Utils Integration', () => {
  beforeAll(async () => {
    // Set up test environment with RSA key
    const key = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048, // Or a different size
        publicExponent: new Uint8Array([1, 0, 1]), // Equivalent to 65537
        hash: 'SHA-256', // Specify the hash algorithm
      },
      true, // extractable
      ['encrypt', 'decrypt']
    ) as CryptoKeyPair

    env.RSA_PRIVATE_KEY = JSON.stringify(await crypto.subtle.exportKey('jwk', key.privateKey));
  });

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
