import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { fetchTrees } from '../../src/steps/github.step'
import { env, fetchMock } from "cloudflare:test"
import { Result, Tree } from "../../src/types/github.graphql.types";

const mockTreeResponse: Result = {
  repository: {
    batch_0: {
      __typename: 'Tree',
      oid: 'f092fb3d8c118f86e13e0d5c3416c69806fc8b8d',
      entries: [
        { name: '.github', oid: 'c8579eec19b3ef983a7bd62942833c418f4d8fd3', type: 'tree' },

        { name: '.gitignore', oid: '6e8266afe8fd798dd3a4ee3f79a7dce0e574639d', type: 'blob' },
        { name: 'Dockerfile', oid: '50c1e8c007b34cf5ad0ac62047310b59507da70f', type: 'blob' },
        { name: 'LICENSE.md', oid: 'c2b4f00ae95a5a454537a7c2b1af76a74ef1b485', type: 'blob' },
        { name: 'README.md', oid: 'e0e6977940b8a13b7b2f1b2b8244041a35079d85', type: 'blob' },
        { name: 'bin', oid: '8ef73875b73801b745e27681f16a825bee29c100', type: 'tree' },

        { name: 'conf', oid: '42312f10d63a083f5b19b404af452c3f3803a9bc', type: 'tree' },
        { name: 'db', oid: 'd564d0bc3dd917926892c55e3706cc116d5b165e', type: 'tree' },
        { name: 'eslint.config.mjs', oid: 'ae2aca9e68f8701e76376754c924bb00db842c97', type: 'blob' },
        { name: 'jest.config.js', oid: '975ac5db6925bca89c6ff60af449f76b49258d5b', type: 'blob' },
        { name: 'knexfile.ts', oid: '6e6fca853d941480d0b41e95e3c1c49fa7bc3f1c', type: 'blob' },

        { name: 'logs', oid: 'd564d0bc3dd917926892c55e3706cc116d5b165e', type: 'tree' },
        { name: 'migrations', oid: 'ab666fde165a0ff4746920b8aa544d571de63a04', type: 'tree' },
        { name: 'nodemon.json', oid: '8a00b91e646159a2f2b71646028b6023058bf135', type: 'blob' },
        { name: 'package-lock.json', oid: 'f14796da231af56715c0c3c17dca46af30faa705', type: 'blob' },

        { name: 'package.json', oid: 'e76f3a2305aa0ab825d6a33a2fd9ce61aa8169b9', type: 'blob' },
        { name: 'src', oid: 'b34801f93167afec4e5e87eab0d4bf65c6b3ee02', type: 'tree' },
        { name: 'tsconfig.json', oid: 'eb4e0090c424732f3806e93bb93c0d837fa110b0', type: 'blob' },
      ],
    },
  },
};

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

afterEach(() => {
  fetchMock.assertNoPendingInterceptors();
});

describe('fetchTrees', () => {
  it('should fetch trees successfully', async () => {
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
    const [pathMap, result] = await fetchTrees(env, owner, repo, shas);

    // Check the returned pathMap
    expect(pathMap).toEqual(new Map([
      ['batch_0', '/'],
    ]));

    // Check the returned result
    expect(result).toEqual(mockTreeResponse);

    // Check the structure of the result
    expect(result.repository?.batch_0).toBeDefined();
    expect(result.repository?.batch_0?.__typename).toBe('Tree');
    expect((result.repository?.batch_0 as Tree).entries).toHaveLength(18);
    expect((result.repository?.batch_0 as Tree).entries?.[0]).toEqual({
      name: '.github',
      oid: 'c8579eec19b3ef983a7bd62942833c418f4d8fd3',
      type: 'tree',
    });
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
    const [pathMap, result] = await fetchTrees(env, owner, repo, shas);

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

    await expect(fetchTrees(env, owner, repo, shas)).rejects.toThrow(
      'GraphQL errors: [{"message":"GraphQL error"}]'
    );
  });
});
