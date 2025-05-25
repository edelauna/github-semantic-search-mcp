import { describe, it, expect, vi, beforeEach, Mock, afterEach } from 'vitest';
import { createExecutionContext, env } from 'cloudflare:test';
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

describe('indexStep', () => {
  let mockEnv: Env;
  const instanceId = 'test-instance-id';
  const owner = 'test-owner';
  const repo = 'test-repo';
  const shas = { path1: 'sha1', path2: 'sha2' };
  const githubTokenRef = 'encrypted-token-ref';
  const ctx = createExecutionContext();

  beforeEach(async () => {
    await env.WORKFLOW_STATE.delete(instanceId);
    mockEnv = {
      ...env,
      INDEX_WORKFLOW: {
        get: vi.fn(),
        create: vi.fn(),
        createBatch: vi.fn(),
      },
    };
    vi.clearAllMocks();
  });

  afterEach(() => vi.restoreAllMocks())

  it('processes new workflows correctly', async () => {
    const fetchSpy = vi.spyOn(GithubStep, 'fetchTrees').mockResolvedValue([new Map(Object.entries(shas)), mockTreeResponse])
    const processSpy = vi.spyOn(TreeStep, 'processTree').mockResolvedValue(new Map(Object.entries(shas)));

    (mockEnv.INDEX_WORKFLOW.createBatch as Mock).mockResolvedValue([{ id: 'child-workflow-1' }]);

    (mockEnv.INDEX_WORKFLOW.get as Mock).mockResolvedValue({
      id: 'child-workflow-1',
      status: vi.fn().mockResolvedValue({ status: 'complete', output: {} }),
    });

    const result = await indexStep(mockEnv, ctx, {
      instanceId,
      payload: { owner, repo, pathMap: shas, githubTokenRef },
      timestamp: new Date(),
    } as WorkflowEvent<IndexWorkflowParams>);

    // Assertions
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
    expect(kvPutSpy).toHaveBeenCalledWith(instanceId, 'child-workflow-1');
    expect(kvDeleteSpy).toHaveBeenCalledWith(instanceId);
    expect(result).toBe(Object.keys(shas).length);
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

    // Execute the indexStep function
    const result = await indexStep(mockEnv, ctx, {
      instanceId,
      payload: { owner, repo, pathMap: shas, githubTokenRef },
      timestamp: new Date(),
    } as WorkflowEvent<IndexWorkflowParams>);

    // Assertions
    expect(result).toBe(Object.keys(shas).length);
    expect(mockEnv.INDEX_WORKFLOW.createBatch).not.toHaveBeenCalled();
    expect(kvPutSpy).not.toHaveBeenCalled();
  });

  it('handles errors in fetchTrees', async () => {
    const fetchSpy = vi.spyOn(GithubStep, 'fetchTrees').mockRejectedValue(new Error('Fetch error'));
    const processSpy = vi.spyOn(TreeStep, 'processTree')

    // Execute the indexStep function and expect it to throw an error
    await expect(indexStep(mockEnv, ctx, {
      instanceId,
      payload: { owner, repo, pathMap: shas, githubTokenRef },
      timestamp: new Date(),
    } as WorkflowEvent<IndexWorkflowParams>)).rejects.toThrow('Fetch error');

    // Assertions
    expect(fetchSpy).toHaveBeenCalledWith(owner, repo, expect.any(Map), githubTokenRef);
    expect(processSpy).not.toHaveBeenCalled();
    expect(mockEnv.INDEX_WORKFLOW.createBatch).not.toHaveBeenCalled();
    expect(kvPutSpy).not.toHaveBeenCalled();
    expect(kvDeleteSpy).not.toHaveBeenCalled();
  });

  it('handles errors in processTree', async () => {
    const fetchSpy = vi.spyOn(GithubStep, 'fetchTrees').mockResolvedValue([new Map(Object.entries(shas)), mockTreeResponse]);
    const processSpy = vi.spyOn(TreeStep, 'processTree').mockRejectedValue(new Error('Process error'));

    // Execute the indexStep function and expect it to throw an error
    await expect(indexStep(mockEnv, ctx, {
      instanceId,
      payload: { owner, repo, pathMap: shas, githubTokenRef },
      timestamp: new Date(),
    } as WorkflowEvent<IndexWorkflowParams>)).rejects.toThrow('Process error');

    // Assertions
    expect(fetchSpy).toHaveBeenCalledWith(owner, repo, expect.any(Map), githubTokenRef);
    expect(processSpy).toHaveBeenCalledWith(mockEnv, ctx, owner, repo, mockTreeResponse, expect.any(Map));
    expect(mockEnv.INDEX_WORKFLOW.createBatch).not.toHaveBeenCalled();
    expect(kvPutSpy).not.toHaveBeenCalled();
    expect(kvDeleteSpy).not.toHaveBeenCalled();
  });
});
