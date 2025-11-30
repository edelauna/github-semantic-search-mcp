import { env } from 'cloudflare:test';
import { afterAll, beforeAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as VectorService from '../../src/services/vector.service';
import * as EmbedService from '../../src/services/embed.service';
import { BATCH_SIZE, doEmbeddings } from '../../src/steps/embed.step';
import { RepoEntry } from '../../src/types/types';
import { EmbedWorkflowParams } from '../../src/workflows/embed-repo.workflow';
import { TokenizedDocument } from '../../src/services/document.service';

const mockCreateEmbeddings = vi.fn(async (_env: Env, _owner: string, _repo: string, input: RepoEntry[], _githubTokenRef: string) => input)
const mockSaveVectors = vi.fn(async (_env: Env, _vectors: any[]) => { })

vi.spyOn(EmbedService, 'createEmbeddings').mockImplementation(mockCreateEmbeddings)
vi.spyOn(VectorService, 'saveVectors').mockImplementation(mockSaveVectors)

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
    await env.DB.exec(`DELETE FROM chunk_queue`)
  })

  afterAll(async () => await env.DB.exec(`DELETE FROM repo`))

  it('should return false and cleanup when no unembedded entries are found', async () => {
    const hasMore = await doEmbeddings(mockEnv, baseParams, instanceId);

    expect(hasMore).toBe(false);
    expect(mockCreateEmbeddings).not.toHaveBeenCalled();
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
    expect(mockCreateEmbeddings).toHaveBeenCalledTimes(1);
    expect(mockCreateEmbeddings).toHaveBeenCalledWith(
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
    expect(mockCreateEmbeddings).toHaveBeenCalledTimes(1);
    expect(mockCreateEmbeddings).toHaveBeenCalledWith(
      mockEnv,
      baseParams.owner,
      baseParams.repo,
      expect.arrayContaining(mockResults.map(x => expect.objectContaining(x))),
      baseParams.githubTokenRef
    );

    const { results } = await mockEnv.DB.prepare('SELECT * from embedding_status').run();
    expect(results.length).toBe(BATCH_SIZE);
  });

  describe('chunked file processing', () => {
    let repoEntryId: number;

    beforeEach(async () => {
      // Create a chunked file entry
      const { results: inserted } = await mockEnv.DB.prepare(
        "INSERT INTO repo_entry(repo_id, oid, path, type) VALUES (1, 'chunked-oid', 'large-file.json', 'blob') RETURNING id"
      ).run<{ id: number }>();
      repoEntryId = inserted[0].id;

      await mockEnv.DB.exec(`
        INSERT INTO embedding_status(repo_entry_id, status) VALUES (${repoEntryId}, 'processing_chunks')
      `);


      for (let i = 0; i < 3; i++) {
        await mockEnv.DB.exec(`
          INSERT INTO chunk_queue(repo_entry_id, chunk_index, processed) VALUES (${repoEntryId}, ${i}, 0)
        `);
      }

      // Mock R2 bucket
      const mockChunks = Array.from({ length: 50 }, (_, i) => ({
        text: `chunk ${i} content`,
        lineRange: [i * 10 + 1, (i + 1) * 10],
        tokenCount: 50
      } as TokenizedDocument));

      const mockR2Object = {
        text: vi.fn().mockResolvedValue(JSON.stringify(mockChunks))
      };

      const mockBucket = {
        put: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(mockR2Object),
        delete: vi.fn().mockResolvedValue(undefined)
      };
      mockEnv.github_semantic_search_bucket = mockBucket as any;

      // Mock AI
      const mockAI = {
        run: vi.fn().mockResolvedValue({
          data: [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6], [0.7, 0.8, 0.9]]
        })
      };
      mockEnv.AI = mockAI as any;
    });

    it('should prioritize processing chunked files over new files', async () => {
      const hasMore = await doEmbeddings(mockEnv, baseParams, instanceId);

      expect(hasMore).toBe(true); // Workflow continues to verify completion
      // Should process chunks successfully
      expect(mockCreateEmbeddings).toHaveBeenCalledWith(mockEnv, baseParams.owner, baseParams.repo, [], baseParams.githubTokenRef); // Called with empty array for new files when only chunked files exist

      // Check that file status was updated to completed
      const { results: status } = await mockEnv.DB.prepare(
        `SELECT status FROM embedding_status WHERE repo_entry_id = ${repoEntryId}`
      ).run<{ status: string }>();
      expect(status[0].status).toBe('completed');

      // Check that chunks were cleaned up after completion
      const { results: chunks } = await mockEnv.DB.prepare(
        `SELECT COUNT(*) as count FROM chunk_queue WHERE repo_entry_id = ${repoEntryId}`
      ).run<{ count: number }>();
      expect(chunks[0].count).toBe(0);
    });

    it('should process chunks in batches and continue workflow', async () => {
      // Create more chunks than batch size
      const additionalChunks = Array.from({ length: BATCH_SIZE + 5 }, (_, i) => i + 3);
      for (const chunkIndex of additionalChunks) {
        await mockEnv.DB.exec(`
          INSERT INTO chunk_queue(repo_entry_id, chunk_index, processed) VALUES (${repoEntryId}, ${chunkIndex}, 0)
        `);
      }

      const hasMore = await doEmbeddings(mockEnv, baseParams, instanceId);

      expect(hasMore).toBe(true); // Should continue because there are more chunks

      // Should have processed exactly BATCH_SIZE chunks
      const { results: processedChunks } = await mockEnv.DB.prepare(
        `SELECT COUNT(*) as count FROM chunk_queue WHERE repo_entry_id = ${repoEntryId} AND processed = 1`
      ).run<{ count: number }>();
      expect(processedChunks[0].count).toBe(BATCH_SIZE);

      // File should still be processing_chunks
      const { results: status } = await mockEnv.DB.prepare(
        `SELECT status FROM embedding_status WHERE repo_entry_id = ${repoEntryId}`
      ).run<{ status: string }>();
      expect(status[0].status).toBe('processing_chunks');
    });

    it('should handle chunk processing errors gracefully', async () => {
      // Mock AI to throw error
      (mockEnv.AI as any).run.mockRejectedValue(new Error('AI processing failed'));

      const hasMore = await doEmbeddings(mockEnv, baseParams, instanceId);

      expect(hasMore).toBe(true);
      // Chunks should remain unprocessed due to error
      const { results: chunks } = await mockEnv.DB.prepare(
        `SELECT processed FROM chunk_queue WHERE repo_entry_id = ${repoEntryId} AND processed = 1`
      ).run();
      expect(chunks.length).toBe(0);
    });

    it('should skip chunked files when chunks data is missing', async () => {
      // Mock R2 to return null
      (mockEnv.github_semantic_search_bucket as any).get.mockResolvedValue(null);

      const hasMore = await doEmbeddings(mockEnv, baseParams, instanceId);

      expect(hasMore).toBe(true);
      // Should not crash, just skip processing
      const { results: status } = await mockEnv.DB.prepare(
        `SELECT status FROM embedding_status WHERE repo_entry_id = ${repoEntryId}`
      ).run<{ status: string }>();
      expect(status[0].status).toBe('processing_chunks'); // Still processing
    });

    it('should handle multiple chunked files simultaneously', async () => {
      // Create a second chunked file
      const { results: inserted2 } = await mockEnv.DB.prepare(
        "INSERT INTO repo_entry(repo_id, oid, path, type) VALUES (1, 'chunked-oid2', 'large-file2.json', 'blob') RETURNING id"
      ).run<{ id: number }>();
      const repoEntryId2 = inserted2[0].id;

      await mockEnv.DB.exec(`
        INSERT INTO embedding_status(repo_entry_id, status) VALUES (${repoEntryId2}, 'processing_chunks')
      `);

      // Add chunks for second file
      for (let i = 0; i < 3; i++) {
        await mockEnv.DB.exec(`
          INSERT INTO chunk_queue(repo_entry_id, chunk_index, processed) VALUES (${repoEntryId2}, ${i}, 0)
        `);
      }

      const hasMore = await doEmbeddings(mockEnv, baseParams, instanceId);

      expect(hasMore).toBe(true); // Should continue processing

      // Both files should be marked completed
      const { results: status1 } = await mockEnv.DB.prepare(
        `SELECT status FROM embedding_status WHERE repo_entry_id = ${repoEntryId}`
      ).run<{ status: string }>();
      const { results: status2 } = await mockEnv.DB.prepare(
        `SELECT status FROM embedding_status WHERE repo_entry_id = ${repoEntryId2}`
      ).run<{ status: string }>();

      expect(status1[0].status).toBe('completed');
      expect(status2[0].status).toBe('completed');

      // Both should have chunks cleaned up after completion
      const { results: chunks1 } = await mockEnv.DB.prepare(
        `SELECT COUNT(*) as count FROM chunk_queue WHERE repo_entry_id = ${repoEntryId}`
      ).run<{ count: number }>();
      const { results: chunks2 } = await mockEnv.DB.prepare(
        `SELECT COUNT(*) as count FROM chunk_queue WHERE repo_entry_id = ${repoEntryId2}`
      ).run<{ count: number }>();

      expect(chunks1[0].count).toBe(0); // First file cleaned up
      expect(chunks2[0].count).toBe(0); // Second file cleaned up
    });


    it('should create workflow when results.length === 0 but chunkedFiles exist', async () => {
      const hasMore = await doEmbeddings(mockEnv, baseParams, instanceId);

      expect(hasMore).toBe(true);
      // Should have created next workflow because chunkedFiles.results.length > 0
      expect(mockEnv.EMBED_WORKFLOW.create).toHaveBeenCalledWith({
        id: expect.any(String),
        params: {
          ...baseParams,
          idIndex: baseParams.idIndex, // Should use original idIndex since no new results
          parentId: instanceId
        }
      });
    });
  });
});

