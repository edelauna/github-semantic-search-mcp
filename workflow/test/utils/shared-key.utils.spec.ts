import { describe, it, expect, afterEach } from 'vitest'
import { generateKey, generateURL } from '../../src/utils/shared-key.utils'
import { env } from 'cloudflare:test'

describe('shared-key utils', () => {

  describe('generateKey', () => {
    it('should generate a key with single line number', () => {
      const key = generateKey(123, 'main', 456, [10, 10])
      expect(key).toBe('/123/main/456/L10')
    })

    it('should generate a key with line number range', () => {
      const key = generateKey(123, 'main', 456, [10, 15])
      expect(key).toBe('/123/main/456/L10-L15')
    })
  })

  describe('generateURL', () => {
    afterEach(() => env.DB.exec('DELETE FROM repo'))

    it('should generate correct GitHub URL for valid inputs', async () => {
      // Setup mocks
      env.DB.exec('INSERT INTO repo(id, owner, name) VALUES (123, "testowner", "testrepo")')
      env.DB.exec('INSERT INTO repo_entry(id, repo_id, oid, path, type) VALUES (456, 123, "abc123", "/src/file.ts", "blob")')

      const url = await generateURL(env, '/123/main/456/L10-L15')
      expect(url).toBe('https://github.com/testowner/testrepo/blob/main/src/file.ts#L10-L15')
    })

    it('should return null when repo is not found', async () => {

      const url = await generateURL(env, '123/main/456/L10-L15')
      expect(url).toBeNull()
    })

    it('should return null when repo entry is not found', async () => {
      // Setup mocks
      env.DB.exec('INSERT INTO repo(id, owner, name) VALUES (123, "testowner", "testrepo")')

      const url = await generateURL(env, '123/main/456/L10-L15')
      expect(url).toBeNull()
    })

    it('should handle invalid vector_id format gracefully', async () => {
      const url = await generateURL(env, 'invalid/format')
      expect(url).toBeNull()
    })
  })
})
