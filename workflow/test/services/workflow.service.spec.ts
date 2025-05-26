import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { checkWorkflowStatus, triggerIndexing } from '../../src/services/workflow.service';
import * as cryptoUtils from '../../src/utils/crpyto.utils';
import { env } from 'cloudflare:test';

// Mock crypto utils
vi.spyOn(cryptoUtils, 'encryptedString').mockResolvedValue('encrypted-token');

// Mock crypto.randomUUID
const mockUUID = 'test-uuid-1234';
vi.spyOn(crypto, 'randomUUID').mockReturnValue(mockUUID);

describe('Workflow Service', () => {
  const mockEnv = {
    ...env,
    INDEX_WORKFLOW: {
      create: vi.fn(),
      get: vi.fn(),
      createBatch: vi.fn()
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await env.DB.prepare('DELETE FROM workflow_run').run()
    await env.DB.prepare('DELETE FROM repo').run()
  })

  describe('checkWorkflowStatus', () => {
    it('should return no workflow when no repo exists', async () => {
      const result = await checkWorkflowStatus('owner', 'repo', mockEnv.DB);

      expect(result).toEqual({
        hasWorkflow: false,
        lastCompleted: null,
        needsReindex: false
      });
      const repos = await env.DB.prepare('SELECT * FROM repo').run()
      expect(repos.results).toEqual([{
        id: 1,
        name: 'repo',
        owner: 'owner'
      }])
    });

    it('should return no workflow when no records exist', async () => {
      await env.DB.prepare('INSERT INTO repo (name, owner) VALUES (?, ?)').bind('repo', 'owner').run()
      const result = await checkWorkflowStatus('owner', 'repo', mockEnv.DB);

      expect(result).toEqual({
        hasWorkflow: false,
        lastCompleted: null,
        needsReindex: false
      });
    });

    it('should return workflow status when record exists', async () => {
      const now = new Date().toISOString();
      await env.DB.prepare('INSERT INTO repo (name, owner) VALUES (?, ?)').bind('repo', 'owner').run()
      await env.DB.prepare('INSERT INTO workflow_run (id, repo_id, status, last_updated_at) VALUES (?, ?, ?, ?)')
        .bind('123', 1, 'completed', now).run()

      const result = await checkWorkflowStatus('owner', 'repo', mockEnv.DB);

      expect(result).toEqual({
        hasWorkflow: true,
        lastCompleted: now,
        needsReindex: false
      });
    });

    it('should indicate reindex needed when workflow is old', async () => {
      const oldDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago
      await env.DB.prepare('INSERT INTO repo (name, owner) VALUES (?, ?)').bind('repo', 'owner').run()
      await env.DB.prepare('INSERT INTO workflow_run (id, repo_id, status, last_updated_at) VALUES (?, ?, ?, ?)')
        .bind('123', 1, 'completed', oldDate).run()


      const result = await checkWorkflowStatus('owner', 'repo', mockEnv.DB);

      expect(result).toEqual({
        hasWorkflow: true,
        lastCompleted: oldDate,
        needsReindex: true
      });
    });
  });

  describe('triggerIndexing', () => {
    it('should create workflow and store encrypted token', async () => {
      await env.DB.prepare('INSERT INTO repo (name, owner) VALUES (?, ?)').bind('repo', 'owner').run()

      // Mock workflow instance
      mockEnv.INDEX_WORKFLOW.create.mockResolvedValue({ id: mockUUID });

      await triggerIndexing('owner', 'repo', 'github-token', mockEnv);

      // Verify token encryption and storage
      expect(cryptoUtils.encryptedString).toHaveBeenCalledWith('github-token');

      // Verify workflow creation
      expect(mockEnv.INDEX_WORKFLOW.create).toHaveBeenCalledWith({
        id: mockUUID,
        params: {
          owner: 'owner',
          repo: 'repo',
          githubTokenRef: mockUUID,
          pathMap: {
            '/': 'HEAD:'
          }
        }
      });
    });

    it('should throw error if repo not found', async () => {
      await expect(
        triggerIndexing('owner', 'nonexistent-repo', 'github-token', mockEnv)
      ).rejects.toThrow();
    });
  });
});
