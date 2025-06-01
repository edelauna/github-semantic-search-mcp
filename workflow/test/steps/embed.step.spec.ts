import { env } from 'cloudflare:test';
import { afterAll, beforeAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as VectorService from '../../src/services/vector.service';
import { BATCH_SIZE, doEmbeddings } from '../../src/steps/embed.step';
import { RepoEntry } from '../../src/types/types';
import { EmbedWorkflowParams } from '../../src/workflows/embed-repo.workflow';

const mockUpdateVectors = vi.fn(async (_env: Env, _owner: string, _repo: string, input: RepoEntry[]) => input)

vi.spyOn(VectorService, 'updateVectors').mockImplementation(mockUpdateVectors)

describe('doEmbeddings', () => {
  let mockEnv: Env;
  const instanceId = 'test-instance-id';
  const baseParams: EmbedWorkflowParams = {
    owner: 'testOwner',
    repo: 'testRepo',
    githubTokenRef: 'githubTokenRef',
    idIndex: 0,
    parentId: null
  };

  beforeAll(async () => {
    await env.DB.exec("INSERT INTO repo(owner, name) VALUES ('testOwner', 'testRepo')");
  })

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = {
      ...env,
      EMBED_WORKFLOW: {
        create: vi.fn().mockResolvedValue({ id: 'new-workflow-id' }),
        get: vi.fn().mockResolvedValue({
          id: 'workflow-instance-id',
          sendEvent: vi.fn().mockResolvedValue(undefined)
        }),
        createBatch: vi.fn()
      },
      WORKFLOW_STATE: {
        delete: vi.fn(),
        get: vi.fn(),
        put: vi.fn(),
        list: vi.fn(),
        getWithMetadata: vi.fn()
      }
    };
  });

  afterEach(async () => {
    await env.DB.exec(`DELETE FROM embedding_status`)
    await env.DB.exec(`DELETE FROM repo_entry`)
  })

  afterAll(async () => await env.DB.exec(`DELETE FROM repo`))

  it('should return false and cleanup when no unembedded entries are found', async () => {
    const hasMore = await doEmbeddings(mockEnv, baseParams, instanceId);

    expect(hasMore).toBe(false);
    expect(mockUpdateVectors).not.toHaveBeenCalled();
    expect(mockEnv.WORKFLOW_STATE.delete).toHaveBeenCalledWith(baseParams.githubTokenRef);
    expect(mockEnv.EMBED_WORKFLOW.create).not.toHaveBeenCalled();
  });

  it('should process a single batch and create next workflow', async () => {
    const mockResults: RepoEntry[] = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      repo_id: 1,
      oid: `oid${i + 1}`,
      path: `path${i + 1}`,
      type: 'blob'
    }));

    const stmt = mockEnv.DB.prepare("INSERT INTO repo_entry(repo_id, oid, path, type) VALUES (1, ?, ?, 'blob')");
    const batch = mockResults.map(x => stmt.bind(x.oid, x.path));
    await mockEnv.DB.batch(batch);

    const hasMore = await doEmbeddings(mockEnv, baseParams, instanceId);

    expect(hasMore).toBe(true);
    expect(mockUpdateVectors).toHaveBeenCalledTimes(1);
    expect(mockUpdateVectors).toHaveBeenCalledWith(
      mockEnv,
      baseParams.owner,
      baseParams.repo,
      expect.arrayContaining(mockResults.map(x => expect.objectContaining(x))),
      baseParams.githubTokenRef
    );

    // Verify embedding status records
    const { results } = await mockEnv.DB.prepare('SELECT * from embedding_status').run();
    expect(results.length).toBe(mockResults.length);

    // Verify next workflow creation
    expect(mockEnv.EMBED_WORKFLOW.create).toHaveBeenCalledWith({
      id: expect.any(String),
      params: {
        ...baseParams,
        idIndex: mockResults[mockResults.length - 1].id,
        parentId: instanceId
      }
    });
  });

  it('should handle a full batch of entries', async () => {
    const mockResults: RepoEntry[] = Array.from({ length: BATCH_SIZE }, (_, i) => ({
      id: i + 1,
      repo_id: 1,
      oid: `oid${i + 1}`,
      path: `path${i + 1}`,
      type: 'blob',
    }));

    const stmt = mockEnv.DB.prepare("INSERT INTO repo_entry(repo_id, oid, path, type) VALUES (1, ?, ?, 'blob')");
    const batch = mockResults.map(x => stmt.bind(x.oid, x.path));
    await mockEnv.DB.batch(batch);

    const hasMore = await doEmbeddings(mockEnv, baseParams, instanceId);

    expect(hasMore).toBe(true);
    expect(mockUpdateVectors).toHaveBeenCalledTimes(1);
    expect(mockUpdateVectors).toHaveBeenCalledWith(
      mockEnv,
      baseParams.owner,
      baseParams.repo,
      expect.arrayContaining(mockResults.map(x => expect.objectContaining(x))),
      baseParams.githubTokenRef
    );

    const { results } = await mockEnv.DB.prepare('SELECT * from embedding_status').run();
    expect(results.length).toBe(BATCH_SIZE);
  });
});
