import { env } from 'cloudflare:test';
import { afterAll, beforeAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as VectorService from '../../src/services/vector.service';
import { BATCH_SIZE, doEmbeddings } from '../../src/steps/embed.step';
import { RepoEntry } from '../../src/types/types';

const mockUpdateVectors = vi.fn(async (_env: Env, _owner: string, _repo: string, input: RepoEntry[]) => input)

vi.spyOn(VectorService, 'updateVectors').mockImplementation(mockUpdateVectors)

describe('doEmbeddings', () => {
  let mockEnv: Env;

  beforeAll(async () => {
    await env.DB.exec("INSERT INTO repo(owner, name) VALUES ('testOwner', 'testRepo')");
  })
  beforeEach(() => {
    vi.clearAllMocks(); // Reset mock calls
    mockEnv = env
  });

  afterEach(async () => {
    await env.DB.exec(`DELETE FROM embedding_status`)
    await env.DB.exec(`DELETE FROM repo_entry`)
  })
  afterAll(async () => await env.DB.exec(`DELETE FROM repo`))

  it('should not call createEmbeddings or log results if no unembedded entries are found', async () => {
    await doEmbeddings(mockEnv, 'testOwner', 'testRepo', 'githubTokenRef');
    expect(mockUpdateVectors).not.toHaveBeenCalled();
  });

  it('should call createEmbeddings and log results for a single batch', async () => {
    const mockResults: RepoEntry[] = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      repo_id: 1,
      oid: `oid${i + 1}`,
      path: `path${i + 1}`,
      type: 'blob',
    }));
    const stmt = mockEnv.DB.prepare("INSERT INTO repo_entry(repo_id, oid, path, type) VALUES (1, ?, ?, 'blob')");
    const batch = mockResults.map(x => stmt.bind(x.oid, x.path));
    await mockEnv.DB.batch(batch);

    await doEmbeddings(mockEnv, 'testOwner', 'testRepo', 'githubTokenRef');

    expect(mockUpdateVectors).toHaveBeenCalledTimes(1);

    const { results } = await mockEnv.DB.prepare('SELECT * from embedding_status').run()

    expect(results.length).toBe(mockResults.length)
  });

  it('should handle multiple batches respecting concurrency', async () => {
    const numEntries = 8 * BATCH_SIZE + 5;
    let mockResults: RepoEntry[] = Array.from({ length: numEntries }, (_, i) => ({
      id: i + 1,
      repo_id: 1,
      oid: `oid${i + 1}`,
      path: `path${i + 1}`,
      type: 'blob',
    }));

    const stmt = mockEnv.DB.prepare("INSERT INTO repo_entry(repo_id, oid, path, type) VALUES (1, ?, ?, 'blob')");
    const batch = mockResults.map(x => stmt.bind(x.oid, x.path));
    await mockEnv.DB.batch(batch);


    await doEmbeddings(mockEnv as any, 'testOwner', 'testRepo', 'githubTokenRef');

    // It should call createEmbeddings multiple times
    expect(mockUpdateVectors).toHaveBeenCalledTimes(Math.ceil(numEntries / BATCH_SIZE));

    const { results } = await mockEnv.DB.prepare('SELECT * from embedding_status').run()

    expect(results.length).toBe(mockResults.length)
  });
});
