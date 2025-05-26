import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { checkRepoAccess } from '../../src/utils/github.util';
import { fetchMock } from 'cloudflare:test';

describe('GitHub Utils', () => {
  beforeAll(() => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
  });

  afterEach(() => {
    fetchMock.assertNoPendingInterceptors();
  });

  afterAll(() => fetchMock.enableNetConnect());

  describe('checkRepoAccess', () => {
    it('should return true when repository is accessible', async () => {
      // Mock successful response
      fetchMock.get('https://api.github.com')
        .intercept({
          path: '/graphql',
          method: 'POST'
        })
        .reply(200, {
          data: {
            repository: {
              id: 'R_123'
            }
          }
        });

      const result = await checkRepoAccess('testOwner', 'testRepo', 'test-token');
      expect(result).toBe(true);
    });

    it('should return false when repository is not found', async () => {
      // Mock not found response
      fetchMock.get('https://api.github.com')
        .intercept({
          path: '/graphql',
          method: 'POST'
        })
        .reply(200, {
          "data": {
            "repository": null
          },
          "errors": [
            {
              "type": "NOT_FOUND",
              "path": [
                "repository"
              ],
              "locations": [
                {
                  "line": 7,
                  "column": 3
                }
              ],
              "message": "Could not resolve to a Repository with the name 'testOwner/nonexistentRepo'."
            }
          ]
        });

      const result = await checkRepoAccess('testOwner', 'nonexistentRepo', 'test-token');
      expect(result).toBe(false);
    });

    it('should return false when API request fails', async () => {
      // Mock failed response
      fetchMock.get('https://api.github.com')
        .intercept({
          path: '/graphql',
          method: 'POST'
        })
        .reply(401, {
          message: 'Bad credentials'
        });

      const result = await checkRepoAccess('testOwner', 'testRepo', 'invalid-token');
      expect(result).toBe(false);
    });
  });
});
