import { env, createExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Result } from "../../src/types/github.graphql.types";
import { processTree } from '../../src/steps/tree.step';
import { RepoEntry } from "../../src/types/types";
import * as VectorService from '../../src/services/vector.service';

const mockDeleteVectors = vi.fn(async (_env: Env, _ctx: ExecutionContext, _input: RepoEntry[]) => { })

vi.spyOn(VectorService, 'deleteVectors').mockImplementation(mockDeleteVectors)

const setup = async () => {
  await env.DB.exec("INSERT INTO repo(owner, name) VALUES ('testOwner', 'testRepo')");
}

describe('processTree', () => {
  let mockCtx: ExecutionContext;

  beforeEach(() => {
    mockCtx = createExecutionContext()
  });

  afterEach(() => {
    env.DB.exec(`DELETE FROM repo_entry`);
    env.DB.exec(`DELETE FROM repo`);
  });

  it('processTreees new tree data correctly', async () => {
    // Set up mock data
    const owner = 'testOwner';
    const repo = 'testRepo';
    const treeData = {
      repository: {
        'HEAD:': {
          __typename: "Tree",
          oid: 'rootOid',
          entries: [
            { oid: 'entry1Oid', name: 'file1', type: 'blob' },
            { oid: 'entry2Oid', name: 'folder1', type: 'tree' },
          ],
        },
      },
    } as Result;

    const pathMap = new Map([['HEAD:', 'root/']]);

    await setup()

    await env.DB.exec('INSERT INTO repo_entry (repo_id, oid, path, type) ' +
      "VALUES (1, 'rootOid', 'root', 'tree')"
    );
    // Run the processTree function

    const result = await processTree(env, mockCtx, owner, repo, treeData, pathMap);

    // Assertions

    expect(result).toEqual(new Map([['root/folder1/', 'entry2Oid']]));

    // Check if repo entries were inserted
    const { results } = await env.DB.prepare('SELECT * from repo_entry').run<RepoEntry>()
    expect(results.length).toBe(3)

    expect(results[1]).toMatchObject({
      id: 2,
      repo_id: 1,
      oid: 'entry1Oid',
      path: 'root/file1',
      type: 'blob',
      parent_repo_entry: 1
    })
    expect(results[2]).toMatchObject({
      id: 3,
      repo_id: 1,
      oid: 'entry2Oid',
      path: 'root/folder1',
      type: 'tree',
      parent_repo_entry: 1
    })
  });

  it('handles existing data and prunes correctly', async () => {
    // Set up mock data
    const owner = 'testOwner';
    const repo = 'testRepo';
    const treeData = {
      repository: {
        'HEAD:': {
          oid: 'rootOid',
          entries: [
            { oid: 'entry1Oid', name: 'file1', type: 'blob' },
          ],
        },
      },
    } as unknown as Result;

    const pathMap = new Map([['HEAD:', '/']]);

    await setup();
    await env.DB.exec('INSERT INTO repo_entry (repo_id, oid, path, type) ' +
      "VALUES (1, 'oldEntryOid', '/file1', 'blob')"
    );

    // Run the processTree function
    const result = await processTree(env, mockCtx, owner, repo, treeData, pathMap);

    // Assertions
    expect(result).toEqual(new Map());

    // Check if pruning was attempted
    const { results } = await env.DB.prepare('SELECT * from repo_entry').run<RepoEntry>()
    expect(results.length).toBe(1)

    expect(results[0]).toMatchObject({
      id: 1,
      repo_id: 1,
      oid: 'entry1Oid',
      path: '/file1',
      type: 'blob',
      parent_repo_entry: null
    })
    expect(mockDeleteVectors).toHaveBeenCalledTimes(1)
  });

  it('handles missing repoId gracefully', async () => {
    // Set up mock data
    const owner = 'testOwner';
    const repo = 'testRepo';

    const treeData = {
      repository: {
        'HEAD:': {
          oid: 'rootOid',
          entries: [],
        },
      },
    } as unknown as Result;

    const pathMap = new Map([['HEAD:', '/']]);

    await expect(() => processTree(env, mockCtx, owner, repo, treeData, pathMap))
      .rejects.toThrow('Missing repoId for (owner, name) -> (testOwner, testRepo)');
  });

  it('fetches parentTree only once per basePath', async () => {
    // Set up mock data with multiple entries in the same basePath
    const owner = 'testOwner';
    const repo = 'testRepo';
    const treeData = {
      repository: {
        'HEAD:': {
          __typename: "Tree",
          oid: 'rootOid',
          entries: [
            { oid: 'entry1Oid', name: 'file1', type: 'blob' },
            { oid: 'entry2Oid', name: 'file2', type: 'blob' },
            { oid: 'entry3Oid', name: 'file3', type: 'blob' },
          ],
        },
      },
    } as Result;

    const pathMap = new Map([['HEAD:', 'root/']]);

    await setup();
    await env.DB.exec('INSERT INTO repo_entry (repo_id, oid, path, type) ' +
      "VALUES (1, 'rootOid', 'root', 'tree')"
    );

    // Spy on DB.prepare to count calls for parentTree query
    const prepareSpy = vi.spyOn(env.DB, 'prepare');

    await processTree(env, mockCtx, owner, repo, treeData, pathMap);

    // Should have called prepare for parentTree query only once
    const parentTreeCalls = prepareSpy.mock.calls.filter(call =>
      call[0].includes('SELECT re.id FROM repo_entry re WHERE re.repo_id = ? AND path = ?')
    );
    expect(parentTreeCalls.length).toBe(1);

    prepareSpy.mockRestore();
  });
});
