import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fetchText, fetchTrees } from '../../src/steps/github.step'
import { fetchMock } from "cloudflare:test"
import { Result, Tree } from "../../src/types/github.graphql.types";
import { fetchTextFixture } from "./fixtures/github.step.spec.fixture";
import * as cryptoUtils from '../../src/utils/crpyto.utils';

// Mock the crypto utils
vi.spyOn(cryptoUtils, 'decryptedString').mockResolvedValue('decrypted-github-token')

const mockTreeResponse: Result = {
  repository: {
    batch_0: {
      __typename: 'Tree',
      oid: 'f092fb3d8c118f86e13e0d5c3416c69806fc8b8d',
      entries: [
        { name: '.github', oid: 'c8579eec19b3ef983a7bd62942833c418f4d8fd3', type: 'tree' },
        { name: '.gitignore', oid: '6e8266afe8fd798dd3a4ee3f79a7dce0e574639d', type: 'blob' },
        { name: 'Dockerfile', oid: '50c1e8c007b34cf5ad0ac62047310b59507da70f', type: 'blob' },
      ],
    },
  },
};

const mockMultiTreeResponse: Result = {
  repository: {
    batch_0: {
      __typename: 'Tree',
      oid: 'f092fb3d8c118f86e13e0d5c3416c69806fc8b8d',
      entries: [
        { name: '.github', oid: 'c8579eec19b3ef983a7bd62942833c418f4d8fd3', type: 'tree' },
      ],
    },
    batch_1: {
      __typename: 'Tree',
      oid: 'a9c111b6e7bb19dafafdb9386290e6d0aebfc88e',
      entries: [
        { name: 'src', oid: 'b34801f93167afec4e5e87eab0d4bf65c6b3ee02', type: 'tree' },
      ],
    },
  },
};

describe('github step specs', () => {
  const githubTokenRef = 'encrypted-token-ref';

  beforeAll(() => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
  });

  afterEach(() => {
    fetchMock.assertNoPendingInterceptors();
  });

  afterAll(() => fetchMock.enableNetConnect())

  describe('fetchTrees', () => {
    it('should fetch single tree successfully', async () => {
      // Mock the fetch response
      fetchMock.get('https://api.github.com')
        .intercept({
          path: '/graphql',
          method: 'POST'
        })
        .reply(200, { data: mockTreeResponse, errors: null });

      // Test data
      const owner = 'testOwner';
      const repo = 'testRepo';

      const shas = new Map<string, string>([
        ['/', 'HEAD:'],
      ]);

      // Call the function
      const [pathMap, result] = await fetchTrees(owner, repo, shas, githubTokenRef);

      // Check the returned pathMap
      expect(pathMap).toEqual(new Map([
        ['batch_0', '/'],
      ]));

      // Check the returned result
      expect(result).toEqual(mockTreeResponse);

      // Check the structure of the result
      expect(result.repository?.batch_0).toBeDefined();
      expect(result.repository?.batch_0?.__typename).toBe('Tree');
      expect((result.repository?.batch_0 as Tree).entries).toHaveLength(3);
      expect((result.repository?.batch_0 as Tree).entries?.[0]).toEqual({
        name: '.github',
        oid: 'c8579eec19b3ef983a7bd62942833c418f4d8fd3',
        type: 'tree',
      });
    });

    it('should fetch multiple trees successfully with incrementing batch IDs', async () => {
      // Mock the fetch response
      fetchMock.get('https://api.github.com')
        .intercept({
          path: '/graphql',
          method: 'POST'
        })
        .reply(200, { data: mockMultiTreeResponse, errors: null });

      // Test data with multiple paths
      const owner = 'testOwner';
      const repo = 'testRepo';
      const shas = new Map<string, string>([
        ['/', 'HEAD:'],
        ['/src', 'b34801f93167afec4e5e87eab0d4bf65c6b3ee02'],
      ]);

      // Call the function
      const [pathMap, result] = await fetchTrees(owner, repo, shas, githubTokenRef);

      // Check the returned pathMap has correct batch IDs
      expect(pathMap).toEqual(new Map([
        ['batch_0', '/'],
        ['batch_1', '/src'],
      ]));

      // Verify both trees are in the result
      expect(result.repository?.batch_0).toBeDefined();
      expect(result.repository?.batch_1).toBeDefined();
      expect(result.repository?.batch_0?.__typename).toBe('Tree');
      expect(result.repository?.batch_1?.__typename).toBe('Tree');
    });

    it('should retry on failure and eventually succeed', async () => {
      // Mock the fetch response to fail twice and then succeed
      const mockPool = fetchMock.get('https://api.github.com')
      mockPool.intercept({
        path: '/graphql',
        method: 'POST'
      })
        .reply(500)
      mockPool
        .intercept({
          path: '/graphql',
          method: 'POST'
        })
        .reply(200, { data: mockTreeResponse, errors: null });

      // Test data
      const owner = 'testOwner';
      const repo = 'testRepo';
      const shas = new Map<string, string>([
        ['path1', 'sha1'],
      ]);

      // Call the function
      const [_, result] = await fetchTrees(owner, repo, shas, githubTokenRef);

      // Assertions
      expect(result).toEqual(mockTreeResponse);
    });

    it('should throw an error on GraphQL errors', async () => {
      // Mock the fetch response with GraphQL errors
      fetchMock.get('https://api.github.com')
        .intercept({
          path: '/graphql',
          method: 'POST'
        })
        .reply(200, { data: null, errors: [{ message: 'GraphQL error' }] }).times(3);

      // Test data
      const owner = 'testOwner';
      const repo = 'testRepo';
      const shas = new Map<string, string>([
        ['path1', 'sha1'],
      ]);

      // Call the function and expect it to throw an error
      await expect(fetchTrees(owner, repo, shas, githubTokenRef)).rejects.toThrow(
        'GraphQL errors: [{"message":"GraphQL error"}]'
      );
    });
  });

  describe('fetchText', () => {
    it('should build the correct GraphQL query and fetch text successfully', async () => {
      const mockResponse = fetchTextFixture()
      fetchMock.get('https://api.github.com')
        .intercept({
          path: '/graphql',
          method: 'POST'
        })
        .reply(200, { data: mockResponse });

      const owner = 'edelauna';
      const repo = 'github-semantic-search-mcp';
      const oidMap = { '1': '50c1e8c007b34cf5ad0ac62047310b59507da70f', '2': 'c2b4f00ae95a5a454537a7c2b1af76a74ef1b485' };

      // Call the function
      const result = await fetchText(owner, repo, oidMap, githubTokenRef);

      // Check the correct structure of the result
      expect(result).toEqual(mockResponse);
    });
  });
});
