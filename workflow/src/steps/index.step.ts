import { WorkflowEvent } from "cloudflare:workers";
import { IndexWorkflowParams } from "../workflows/index-repo.workflow";
import { wait } from "../utils/wait";
import { fetchTrees } from "./github.step";
import { processTree } from "./tree.step";
import { log } from "../utils/logging.utils";

const waitOnComplete = async (env: Env, instances: string[],) => {
  const terminalStates = ["errored",
    "terminated", // user terminated the instance while it was running
    "complete"
  ]
  while (instances.length > 0) {
    await wait(1_000)
    const id = instances.pop()!
    const newInstance = await env.INDEX_WORKFLOW.get(id)
    const { status, output } = await newInstance.status()
    if (!terminalStates.includes(status)) {
      instances.push(newInstance.id)
    } else {
      log.info('waitOnComplete', `Workflow ${newInstance.id} completed`, { status, output });
    }
  }
}

const spawnIndexChildWorkflow = async (env: Env, pathMap: Map<string, string>, owner: string, repo: string, githubTokenRef: string) => {
  const newPathMapAsArray = Array.from(pathMap.entries())

  const batch = newPathMapAsArray.reduce((acc, [path, sha], index) => {
    const batchIndex = Math.floor(index / 100)

    if (!acc[batchIndex]) acc[batchIndex] = {
      id: crypto.randomUUID(),
      params: {
        owner,
        repo,
        githubTokenRef,
        pathMap: {}
      }
    }

    acc[batchIndex].params.pathMap[path] = sha

    return acc
  }, [] as {
    id: string;
    params: IndexWorkflowParams;
  }[])

  const childWorkflows = (batch.length > 0) ? await env.INDEX_WORKFLOW.createBatch(batch) : []

  return childWorkflows.map(c => c.id)
}

const isParentWorkflow = async (env: Env, instanceId: string) => {
  const result = await env.DB.prepare("SELECT id from workflow_run WHERE id = ?"
  ).bind(instanceId).first<{ id: string }>()
  return result?.id == instanceId
}

const callEmbedWorkflow = async (env: Env, ctx: ExecutionContext, instanceId: string, owner: string, repo: string, githubTokenRef: string) => {
  if (await isParentWorkflow(env, instanceId)) {
    log.info('callEmbedWorfklow', `Calling embed workflow for ${owner}/${repo}`)
    ctx.waitUntil(env.EMBED_WORKFLOW.create({
      id: crypto.randomUUID(),
      params: {
        owner,
        repo,
        githubTokenRef
      }
    }))
  }

}

const updateWorkflowRun = async (env: Env, instanceId: string, status: string) => {
  if (await isParentWorkflow(env, instanceId)) {
    await env.DB.prepare("UPDATE workflow_run SET status = ? WHERE id = ?").bind(status, instanceId).run()
  }
}

const run = async (env: Env, ctx: ExecutionContext, event: WorkflowEvent<IndexWorkflowParams>) => {
  const { instanceId } = event
  const { owner, repo, githubTokenRef } = event.payload
  const shas = Object.entries(event.payload.pathMap)

  let childWorkflows = (await env.WORKFLOW_STATE.get(instanceId))?.split(',') ?? []

  if (childWorkflows.length === 0) {
    const [pathMap, treeData] = await fetchTrees(owner, repo, new Map(shas), githubTokenRef)
    const newPathMap = await processTree(env, ctx, owner, repo, treeData, pathMap)
    childWorkflows = await spawnIndexChildWorkflow(env, newPathMap, owner, repo, githubTokenRef)
    ctx.waitUntil(env.WORKFLOW_STATE.put(instanceId, childWorkflows.join(',')))
  }

  await waitOnComplete(env, childWorkflows)

  await callEmbedWorkflow(env, ctx, instanceId, owner, repo, githubTokenRef)

  ctx.waitUntil(env.WORKFLOW_STATE.delete(instanceId))

  return shas.length
}

export const indexStep = async (env: Env, ctx: ExecutionContext, event: WorkflowEvent<IndexWorkflowParams>) => {
  const { instanceId } = event
  try {
    const updatePromise = updateWorkflowRun(env, instanceId, 'running')
    const result = await run(env, ctx, event)
    ctx.waitUntil(Promise.all([
      updatePromise,
      updateWorkflowRun(env, instanceId, 'complete')
    ]))
    return result
  }
  catch (error) {
    ctx.waitUntil(updateWorkflowRun(env, instanceId, 'failed'))
    throw error
  }
}
