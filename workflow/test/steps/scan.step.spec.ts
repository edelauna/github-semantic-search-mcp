import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { env } from 'cloudflare:test';
import { scan } from '../../src/steps/scan.step';

describe('scan', () => {
  let mockEnv: Env;

  beforeEach(() => {
    env.DB.exec(`DELETE FROM repo`)

    mockEnv = {
      ...env,
      INDEX_WORKFLOW: {
        get: vi.fn(),
        create: vi.fn(),
        createBatch: vi.fn(),
      },
    };
  });

  it('processes and inserts data correctly', async () => {
    await env.DB.exec("INSERT INTO repo(owner, name) VALUES ('user1', 'repo1'), ('user2','repo2')");

    // Mock INDEX_WORKFLOW methods
    (mockEnv.INDEX_WORKFLOW.get as Mock).mockImplementation((_id: string) => ({
      status: vi.fn().mockResolvedValue({ status: 'complete' }),
    }));

    (mockEnv.INDEX_WORKFLOW.createBatch as Mock).mockResolvedValue(undefined);

    // Run the scan function
    const processed = await scan(mockEnv);

    // Assertions

    expect(processed).toBe(2); // We have 2 results in mockResults

    // Check if INDEX_WORKFLOW.createBatch was called with the correct batch
    expect(mockEnv.INDEX_WORKFLOW.createBatch).toHaveBeenCalledWith([
      { id: '1', params: { owner: 'user1', repo: 'repo1', pathMap: { '/': 'HEAD:' } } },
      { id: '2', params: { owner: 'user2', repo: 'repo2', pathMap: { '/': 'HEAD:' } } },
    ]);
  });

  it('processes and inserts data with existing child workflows', async () => {
    await env.DB.exec("INSERT INTO repo(owner, name) VALUES ('user1', 'repo1'), ('user2','repo2')");
    // Mock initial state with existing child workflows
    await env.WORKFLOW_STATE.put('scan-workflow', [1, 2].join(','))

    await env.DB.exec("INSERT INTO repo(owner, name) VALUES ('user3', 'repo3'), ('user4','repo4')");

    // Mock INDEX_WORKFLOW methods
    (mockEnv.INDEX_WORKFLOW.get as Mock).mockImplementation((id: string) => {
      let count = 0
      return {
        status: vi.fn().mockResolvedValue(id === '1' && count > 2 ? { status: 'running' } : { status: 'complete' }),
      }
    });

    (mockEnv.INDEX_WORKFLOW.createBatch as Mock).mockResolvedValue(undefined);
    // Run the scan function
    const processed = await scan(mockEnv);

    // Assertions
    expect(processed).toBe(2); // We have 2 new results

    // Check if INDEX_WORKFLOW.createBatch was called with the correct batch
    expect(mockEnv.INDEX_WORKFLOW.createBatch).toHaveBeenCalledWith([
      { id: '3', params: { owner: 'user3', repo: 'repo3', pathMap: { '/': 'HEAD:' } } },
      { id: '4', params: { owner: 'user4', repo: 'repo4', pathMap: { '/': 'HEAD:' } } },
    ]);
  });

  it('handles no new data correctly', async () => {
    // Mock initial state
    (mockEnv.INDEX_WORKFLOW.get as Mock).mockResolvedValue('');

    // Run the scan function
    const processed = await scan(mockEnv);

    // Assertions
    expect(processed).toBe(0); // No new data

    // Check if INDEX_WORKFLOW.createBatch was not called
    expect(mockEnv.INDEX_WORKFLOW.createBatch).not.toHaveBeenCalled();
  });

  it('handles errors gracefully', async () => {
    // Mock the DB to throw an error
    const originalPrepare = env.DB.prepare;
    env.DB.prepare = vi.fn().mockImplementation(() => {
      throw new Error('Database error');
    });

    try {
      await scan(env);
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Database error');
    } finally {
      env.DB.prepare = originalPrepare; // Restore original function
    }
  });
})
