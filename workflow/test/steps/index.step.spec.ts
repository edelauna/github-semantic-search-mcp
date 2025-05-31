import { describe, it, expect, vi, beforeEach, Mock, afterEach } from 'vitest';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { indexStep } from '../../src/steps/index.step';
import { WorkflowEvent } from "cloudflare:workers";
import { IndexWorkflowParams } from "../../src/workflows/index-repo.workflow";
// had to end up spying because vi.mock seems to not get hoisted properyl
import * as GithubStep from '../../src/steps/github.step';
import * as TreeStep from '../../src/steps/tree.step';
import { Result } from '../../src/types/github.graphql.types';

const mockTreeResponse: Result = {
  repository: {
    batch_0: {
      __typename: 'Tree',
      oid: 'f092fb3d8c118f86e13e0d5c3416c69806fc8b8d',
      entries: [
        { name: '.github', oid: 'c8579eec19b3ef983a7bd62942833c418f4d8fd3', type: 'tree' },
      ],
    },
  },
};

const kvPutSpy = vi.spyOn(env.WORKFLOW_STATE, 'put')
const kvDeleteSpy = vi.spyOn(env.WORKFLOW_STATE, 'delete')
const PARENT_PREFIX = 'parent-';

describe('indexStep', () => {
  let mockEnv: Env;
  const instanceId = 'test-instance-id';
  const owner = 'test-owner';
  const repo = 'test-repo';
  const shas = { path1: 'sha1', path2: 'sha2' };
  const githubTokenRef = 'encrypted-token-ref';
  const ctx = createExecutionContext();

  beforeEach(async () => {
    // Setup fake timers
    vi.useFakeTimers();

    await env.WORKFLOW_STATE.delete(instanceId);
    await env.WORKFLOW_STATE.delete(PARENT_PREFIX + instanceId);
    mockEnv = {
      ...env,
      INDEX_WORKFLOW: {
        get: vi.fn(),
        create: vi.fn(),
        createBatch: vi.fn().mockImplementation((batch: WorkflowInstanceCreateOptions<unknown>[]) => {
          return batch.map(b => ({ id: b.id }))
        }),
      },
      EMBED_WORKFLOW: {
        get: vi.fn(),
        create: vi.fn().mockImplementation(() => ({ id: 'embed-workflow-1' })),
        createBatch: vi.fn(),
      },
    };

    // Setup default embed workflow status mock
    (mockEnv.EMBED_WORKFLOW.get as Mock).mockImplementation(() => ({
      status: vi.fn().mockResolvedValue({ status: 'complete', output: {} })
    }));

    vi.clearAllMocks();
  });

  afterEach(async () => {
    await mockEnv.DB.exec('DELETE FROM repo');
    vi.restoreAllMocks();
    // Cleanup fake timers
    vi.useRealTimers();
  });

  it('processes new workflows correctly and triggers embed workflow', async () => {
    const fetchSpy = vi.spyOn(GithubStep, 'fetchTrees').mockResolvedValue([new Map(Object.entries(shas)), mockTreeResponse])
    const processSpy = vi.spyOn(TreeStep, 'processTree').mockResolvedValue(new Map(Object.entries(shas)));

    (mockEnv.INDEX_WORKFLOW.get as Mock).mockResolvedValue({
      id: 'child-workflow-1',
      status: vi.fn().mockResolvedValue({ status: 'complete', output: {} }),
    });

    await mockEnv.DB.exec("INSERT INTO repo (owner, name) VALUES ('test-owner','test-repo')")
    await mockEnv.DB.exec("INSERT INTO workflow_run (id, status, repo_id) VALUES ('test-instance-id', 'running', 1)")

    const resultPromise = indexStep(mockEnv, ctx, {
      instanceId,
      payload: { owner, repo, pathMap: shas, githubTokenRef },
      timestamp: new Date(),
    } as WorkflowEvent<IndexWorkflowParams>);

    await vi.advanceTimersByTimeAsync(35_000);

    const result = await resultPromise;

    // Assertions for index workflow
    expect(fetchSpy).toHaveBeenCalledWith(owner, repo, expect.any(Map), githubTokenRef);
    expect(processSpy).toHaveBeenCalledWith(mockEnv, ctx, owner, repo, mockTreeResponse, expect.any(Map));
    expect(mockEnv.INDEX_WORKFLOW.createBatch).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        params: expect.objectContaining({
          owner,
          repo,
          githubTokenRef,
        })
      })
    ]));
    expect(kvPutSpy).toHaveBeenCalledWith(instanceId, expect.any(String));
    expect(kvPutSpy).toHaveBeenCalledWith(PARENT_PREFIX + instanceId, 'embed-workflow-1');
    expect(kvDeleteSpy).toHaveBeenCalledWith(instanceId);
    expect(result).toBe(Object.keys(shas).length);

    // Assertions for embed workflow
    expect(mockEnv.EMBED_WORKFLOW.create).toHaveBeenCalledWith(expect.objectContaining({
      params: {
        owner,
        repo,
        githubTokenRef,
        idIndex: 0,
      }
    }));

    await waitOnExecutionContext(ctx)
    const workflowStatus = await mockEnv.DB.prepare(
      'SELECT status FROM workflow_run WHERE id = ?'
    ).bind(instanceId).first<{ status: string }>()
    expect(workflowStatus?.status).toBe('complete');
  });

  it('handles existing child workflows', async () => {
    // Set up existing child workflows in WORKFLOW_STATE
    await env.WORKFLOW_STATE.put(instanceId, 'child1,child2');

    // Mock the INDEX_WORKFLOW.get function to return the status of existing child workflows
    (mockEnv.INDEX_WORKFLOW.get as Mock)
      .mockImplementation((id: string) => ({
        id,
        status: vi.fn().mockResolvedValue({ status: 'complete', output: {} }),
      }));

    await mockEnv.DB.exec("INSERT INTO repo (owner, name) VALUES ('test-owner','test-repo')")
    await mockEnv.DB.exec("INSERT INTO workflow_run (id, status, repo_id) VALUES ('test-instance-id', 'running', 1)")

    // Execute the indexStep function
    const resultPromise = indexStep(mockEnv, ctx, {
      instanceId,
      payload: { owner, repo, pathMap: shas, githubTokenRef },
      timestamp: new Date(),
    } as WorkflowEvent<IndexWorkflowParams>);

    await vi.advanceTimersByTimeAsync(35_000);

    const result = await resultPromise;

    // Assertions
    expect(result).toBe(Object.keys(shas).length);
    expect(mockEnv.INDEX_WORKFLOW.createBatch).not.toHaveBeenCalled();
    expect(kvPutSpy).not.toHaveBeenCalled();
    expect(mockEnv.EMBED_WORKFLOW.create).toHaveBeenCalled();

    await waitOnExecutionContext(ctx)
    const workflowStatus = await mockEnv.DB.prepare(
      'SELECT status FROM workflow_run WHERE id = ?'
    ).bind(instanceId).first<{ status: string }>()
    expect(workflowStatus?.status).toBe('complete');
  });

  it('skips embed workflow if workflow_run id does not match', async () => {
    await mockEnv.DB.exec("INSERT INTO repo (owner, name) VALUES ('test-owner','test-repo')");
    await mockEnv.DB.exec("INSERT INTO workflow_run (id, status, repo_id) VALUES ('test-instance-id2', 'running', 1)");

    // Mock the INDEX_WORKFLOW.get function to return the status of existing child workflows
    (mockEnv.INDEX_WORKFLOW.get as Mock)
      .mockImplementation((id: string) => ({
        id,
        status: vi.fn().mockResolvedValue({ status: 'complete', output: {} }),
      }));

    const fetchSpy = vi.spyOn(GithubStep, 'fetchTrees').mockResolvedValue([new Map(Object.entries(shas)), mockTreeResponse])
    const processSpy = vi.spyOn(TreeStep, 'processTree').mockResolvedValue(new Map(Object.entries(shas)));

    const resultPromise = indexStep(mockEnv, ctx, {
      instanceId,
      payload: { owner, repo, pathMap: shas, githubTokenRef },
      timestamp: new Date(),
    } as WorkflowEvent<IndexWorkflowParams>);

    await vi.advanceTimersByTimeAsync(35_000);

    await resultPromise;

    expect(mockEnv.EMBED_WORKFLOW.create).not.toHaveBeenCalled();

    await waitOnExecutionContext(ctx)
    const workflowStatus = await mockEnv.DB.prepare(
      'SELECT status FROM workflow_run WHERE id = ?'
    ).bind('test-instance-id2').first<{ status: string }>()
    expect(workflowStatus?.status).toBe('running');
  });

  it('handles errors in fetchTrees', async () => {
    const fetchSpy = vi.spyOn(GithubStep, 'fetchTrees').mockRejectedValue(new Error('Fetch error'));
    const processSpy = vi.spyOn(TreeStep, 'processTree')
    await mockEnv.DB.exec("INSERT INTO repo (owner, name) VALUES ('test-owner','test-repo')");
    await mockEnv.DB.exec("INSERT INTO workflow_run (id, status, repo_id) VALUES ('test-instance-id', 'running', 1)");

    await expect(indexStep(mockEnv, ctx, {
      instanceId,
      payload: { owner, repo, pathMap: shas, githubTokenRef },
      timestamp: new Date(),
    } as WorkflowEvent<IndexWorkflowParams>)).rejects.toThrow('Fetch error');

    // Assertions
    expect(fetchSpy).toHaveBeenCalledWith(owner, repo, expect.any(Map), githubTokenRef);
    expect(processSpy).not.toHaveBeenCalled();
    expect(mockEnv.INDEX_WORKFLOW.createBatch).not.toHaveBeenCalled();
    expect(mockEnv.EMBED_WORKFLOW.create).not.toHaveBeenCalled();
    expect(kvPutSpy).not.toHaveBeenCalled();
    expect(kvDeleteSpy).not.toHaveBeenCalled();

    await waitOnExecutionContext(ctx)
    const workflowStatus = await mockEnv.DB.prepare(
      'SELECT status FROM workflow_run WHERE id = ?'
    ).bind(instanceId).first<{ status: string }>()
    expect(workflowStatus?.status).toBe('failed');
  });

  it('handles errors in processTree', async () => {
    const fetchSpy = vi.spyOn(GithubStep, 'fetchTrees').mockResolvedValue([new Map(Object.entries(shas)), mockTreeResponse]);
    const processSpy = vi.spyOn(TreeStep, 'processTree').mockRejectedValue(new Error('Process error'));
    await mockEnv.DB.exec("INSERT INTO repo (owner, name) VALUES ('test-owner','test-repo')");
    await mockEnv.DB.exec("INSERT INTO workflow_run (id, status, repo_id) VALUES ('test-instance-id', 'running', 1)");

    await expect(indexStep(mockEnv, ctx, {
      instanceId,
      payload: { owner, repo, pathMap: shas, githubTokenRef },
      timestamp: new Date(),
    } as WorkflowEvent<IndexWorkflowParams>)).rejects.toThrow('Process error');

    // Assertions
    expect(fetchSpy).toHaveBeenCalledWith(owner, repo, expect.any(Map), githubTokenRef);
    expect(processSpy).toHaveBeenCalledWith(mockEnv, ctx, owner, repo, mockTreeResponse, expect.any(Map));
    expect(mockEnv.INDEX_WORKFLOW.createBatch).not.toHaveBeenCalled();
    expect(mockEnv.EMBED_WORKFLOW.create).not.toHaveBeenCalled();
    expect(kvPutSpy).not.toHaveBeenCalled();
    expect(kvDeleteSpy).not.toHaveBeenCalled();

    await waitOnExecutionContext(ctx)
    const workflowStatus = await mockEnv.DB.prepare(
      'SELECT status FROM workflow_run WHERE id = ?'
    ).bind(instanceId).first<{ status: string }>()
    expect(workflowStatus?.status).toBe('failed');
  });

  it('waits for embed workflow to complete', async () => {
    const fetchSpy = vi.spyOn(GithubStep, 'fetchTrees').mockResolvedValue([new Map(Object.entries(shas)), mockTreeResponse]);
    const processSpy = vi.spyOn(TreeStep, 'processTree').mockResolvedValue(new Map(Object.entries(shas)));

    // Setup embed workflow to transition from running to complete
    let callCount = 0;
    (mockEnv.EMBED_WORKFLOW.get as Mock).mockImplementation(() => ({
      status: vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          status: callCount === 1 ? 'running' : 'complete',
          output: {}
        });
      })
    }));

    // Mock the INDEX_WORKFLOW.get function to return the status of existing child workflows
    (mockEnv.INDEX_WORKFLOW.get as Mock)
      .mockImplementation((id: string) => ({
        id,
        status: vi.fn().mockResolvedValue({ status: 'complete', output: {} }),
      }));

    await mockEnv.DB.exec("INSERT INTO repo (owner, name) VALUES ('test-owner','test-repo')");
    await mockEnv.DB.exec("INSERT INTO workflow_run (id, status, repo_id) VALUES ('test-instance-id', 'running', 1)");

    const resultPromise = indexStep(mockEnv, ctx, {
      instanceId,
      payload: { owner, repo, pathMap: shas, githubTokenRef },
      timestamp: new Date(),
    } as WorkflowEvent<IndexWorkflowParams>);

    // Advance timers to skip the waits
    await vi.advanceTimersByTimeAsync(65_000);

    const result = await resultPromise;

    expect(result).toBe(Object.keys(shas).length);
    expect(mockEnv.EMBED_WORKFLOW.get).toHaveBeenCalledTimes(2);
    expect(callCount).toBeGreaterThan(1); // Should have polled multiple times

    await waitOnExecutionContext(ctx);
    const workflowStatus = await mockEnv.DB.prepare(
      'SELECT status FROM workflow_run WHERE id = ?'
    ).bind(instanceId).first<{ status: string }>();
    expect(workflowStatus?.status).toBe('complete');
  });
});
