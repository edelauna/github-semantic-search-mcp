import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { handleGitHubSemanticSearch } from '../../../../src/handlers/tools/github-semantic-search/github-semantic-search.tool';
import * as githubUtil from '../../../../src/utils/github.util';
import * as workflowService from '../../../../src/services/workflow.service';
import { env } from 'cloudflare:test';
import { EMBEDDING_MODEL } from '../../../../src/services/embed.service';

describe('GitHub Semantic Search Tool', () => {
  // Create properly typed mocks
  const mockAIRun = vi.fn();
  const mockVectorizeQuery = vi.fn();
  const mockBucketGet = vi.fn();

  const mockEnv = {
    ...env,
    AI: {
      run: mockAIRun
    },
    VECTORIZE: {
      query: mockVectorizeQuery
    },
    github_semantic_search_bucket: {
      ...env.github_semantic_search_bucket,
      get: mockBucketGet
    },
    INDEX_WORKFLOW: {
      create: vi.fn(),
      get: vi.fn(),
      createBatch: vi.fn()
    }
  } as unknown as Env;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await env.DB.prepare('DELETE FROM workflow_run').run();
    await env.DB.prepare('DELETE FROM repo').run();
  });

  describe('input validation', () => {
    it('should reject queries that are too long', async () => {
      const longQuery = 'x '.repeat(1000); // Will definitely exceed token limit

      const result = await handleGitHubSemanticSearch(
        longQuery,
        'owner',
        'repo',
        'token',
        mockEnv
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Query is too long');
    });
  });

  describe('repository access', () => {
    it('should reject when repository access is denied', async () => {
      vi.spyOn(githubUtil, 'checkRepoAccess').mockResolvedValue(false);

      const result = await handleGitHubSemanticSearch(
        'test query',
        'owner',
        'repo',
        'invalid-token',
        mockEnv
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('does not have access');
    });
  });

  describe('workflow handling', () => {
    it('should trigger initial indexing for new repository', async () => {
      // Mock repository access check
      vi.spyOn(githubUtil, 'checkRepoAccess').mockResolvedValue(true);

      // Mock workflow status check
      vi.spyOn(workflowService, 'checkWorkflowStatus').mockResolvedValue({
        hasWorkflow: false,
        lastCompleted: null,
        needsReindex: false
      });

      // Mock workflow triggering
      vi.spyOn(workflowService, 'triggerIndexing').mockResolvedValue();

      const result = await handleGitHubSemanticSearch(
        'test query',
        'owner',
        'repo',
        'token',
        mockEnv
      );

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('Indexing has been initiated');
      expect(workflowService.triggerIndexing).toHaveBeenCalledWith('owner', 'repo', 'token', mockEnv);
    });

    it('should trigger reindexing for outdated index and return results', async () => {
      // Mock repository access check
      vi.spyOn(githubUtil, 'checkRepoAccess').mockResolvedValue(true);

      // Mock workflow status check
      const oldDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      vi.spyOn(workflowService, 'checkWorkflowStatus').mockResolvedValue({
        hasWorkflow: true,
        lastCompleted: oldDate,
        needsReindex: true
      });

      // Mock AI embedding
      mockAIRun.mockResolvedValue({
        data: [[0.1, 0.2, 0.3]]
      });

      // Mock vector search with metadata and scores
      mockVectorizeQuery.mockResolvedValue({
        matches: [
          {
            id: '/1/HEAD/1/L1-L10',
            metadata: { path: '/src/file1.ts' },
            score: 0.95
          },
          {
            id: '/1/HEAD/2/L5',
            metadata: { path: '/src/file2.ts' },
            score: 0.85
          }
        ]
      });

      env.DB.exec('INSERT INTO repo (id, owner, name) VALUES (1, "owner", "repo")')
      env.DB.exec('INSERT INTO repo_entry (id, repo_id, oid, path, type) VALUES (1, 1, "oid", "/src/file1.ts", "blob")')
      env.DB.exec('INSERT INTO repo_entry (id, repo_id, oid, path, type) VALUES (2, 1, "oid", "/src/file2.ts", "blob")')

      // Mock bucket content
      mockBucketGet.mockImplementation((id: string) => Promise.resolve({
        text: () => Promise.resolve(`Content for ${id}`)
      } as R2ObjectBody));

      const result = await handleGitHubSemanticSearch(
        'test query',
        'owner',
        'repo',
        'token',
        mockEnv
      );

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('Reindexing in progress');

      // Check that results include file paths, URLs and scores
      const resultText = result.content[0].text;
      expect(resultText).toContain('File: /src/file1.ts');
      expect(resultText).toContain('URL: https://github.com/owner/repo/blob/HEAD/src/file1.ts#L1-L10');
      expect(resultText).toContain('Score: 0.9500');
      expect(resultText).toContain('File: /src/file2.ts');
      expect(resultText).toContain('URL: https://github.com/owner/repo/blob/HEAD/src/file2.ts#L5');
      expect(resultText).toContain('Score: 0.8500');

      // Verify results are sorted by score (highest first)
      const file1Index = resultText.indexOf('/src/file1.ts');
      const file2Index = resultText.indexOf('/src/file2.ts');
      expect(file1Index).toBeLessThan(file2Index);

      expect(workflowService.triggerIndexing).toHaveBeenCalledWith('owner', 'repo', 'token', mockEnv);
    });
  });

  describe('search functionality', () => {
    it('should perform search and return formatted results', async () => {
      // Mock repository access check
      vi.spyOn(githubUtil, 'checkRepoAccess').mockResolvedValue(true);

      // Mock workflow status check
      const recentDate = new Date().toISOString();
      vi.spyOn(workflowService, 'checkWorkflowStatus').mockResolvedValue({
        hasWorkflow: true,
        lastCompleted: recentDate,
        needsReindex: false
      });

      // Mock AI embedding
      mockAIRun.mockResolvedValue({
        data: [[0.1, 0.2, 0.3]]
      });

      // Mock vector search with metadata and scores
      mockVectorizeQuery.mockResolvedValue({
        matches: [
          {
            id: '/1/HEAD/1/L1-L10',
            metadata: { path: '/src/file1.ts' },
            score: 0.95
          },
          {
            id: '/1/HEAD/2/L5',
            metadata: { path: '/src/file2.ts' },
            score: 0.85
          }
        ]
      });

      env.DB.exec('INSERT INTO repo (id, owner, name) VALUES (1, "owner", "repo")')
      env.DB.exec('INSERT INTO repo_entry (id, repo_id, oid, path, type) VALUES (1, 1, "oid", "/src/file1.ts", "blob")')
      env.DB.exec('INSERT INTO repo_entry (id, repo_id, oid, path, type) VALUES (2, 1, "oid", "/src/file2.ts", "blob")')


      // Mock bucket content
      mockBucketGet.mockImplementation((id: string) => Promise.resolve({
        text: () => Promise.resolve(`Content for ${id}`)
      } as R2ObjectBody));

      const result = await handleGitHubSemanticSearch(
        'test query',
        'owner',
        'repo',
        'token',
        mockEnv
      );

      expect(result.isError).toBe(false);

      // Check that results include file paths, URLs and scores
      const resultText = result.content[0].text;
      expect(resultText).toContain('File: /src/file1.ts');
      expect(resultText).toContain('URL: https://github.com/owner/repo/blob/HEAD/src/file1.ts#L1-L10');
      expect(resultText).toContain('Score: 0.9500');
      expect(resultText).toContain('File: /src/file2.ts');
      expect(resultText).toContain('URL: https://github.com/owner/repo/blob/HEAD/src/file2.ts#L5');
      expect(resultText).toContain('Score: 0.8500');

      // Verify results are sorted by score (highest first)
      const file1Index = resultText.indexOf('/src/file1.ts');
      const file2Index = resultText.indexOf('/src/file2.ts');
      expect(file1Index).toBeLessThan(file2Index);

      expect(mockAIRun).toHaveBeenCalledWith(EMBEDDING_MODEL, { text: 'test query' });
      expect(mockVectorizeQuery).toHaveBeenCalledWith(
        [0.1, 0.2, 0.3],
        expect.objectContaining({
          filter: {
            owner: { $eq: 'owner' },
            repo: { $eq: 'repo' },
            branch: { $eq: 'HEAD' }
          },
          topK: 5,
          returnMetadata: true
        })
      );
    });

    it('should handle errors gracefully', async () => {
      // Mock repository access check to throw error
      vi.spyOn(githubUtil, 'checkRepoAccess').mockRejectedValue(new Error('Network error'));

      const result = await handleGitHubSemanticSearch(
        'test query',
        'owner',
        'repo',
        'token',
        mockEnv
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Network error');
    });
  });
});
