import { env, createExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { Result } from "../../src/types/github.graphql.types";
import { processTree } from '../../src/steps/tree.step';
import { RepoEntry } from "../../src/types/types";

const setup = async () => {
  await env.DB.exec("INSERT INTO repo(owner, name) VALUES ('testOwner', 'testRepo')");
}

describe('processTree', () => {
  let mockCtx: ExecutionContext;

  beforeEach(() => {
    // Clear the database before each test
    env.DB.exec(`DELETE FROM repo_entry`);
    env.DB.exec(`DELETE FROM repo`);

    mockCtx = createExecutionContext()
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
});
