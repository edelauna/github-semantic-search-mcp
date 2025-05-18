import { WorkflowEvent } from "cloudflare:workers";
import { IndexWorkflowParams } from "../workflows/index-repo.workflow";
import { wait } from "../utils/wait";
import { fetchTrees } from "./github.step";
import { process } from "./tree.step";

const waitOnComplete = async (env: Env, parentInstanceId: string, instances: string[],) => {
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
      await env.WORKFLOW_STATE.put(parentInstanceId, instances.join(","))
      console.log(`[+]\tWorkflow:${newInstance.id}:output:`, output)
    }
  }
}

const spawnIndexChildWorkflow = async (env: Env, pathMap: Map<string, string>, owner: string, repo: string) => {
  const newPathMapAsArray = Array.from(pathMap.entries())

  const batch = newPathMapAsArray.reduce((acc, [path, sha], index) => {
    const batchIndex = Math.floor(index / 100)

    if (!acc[batchIndex]) acc[batchIndex] = {
      id: crypto.randomUUID(),
      params: {
        owner,
        repo,
        pathMap: {}
      }
    }

    acc[batchIndex].params.pathMap[path] = sha

    return acc
  }, [] as {
    id: string;
    params: IndexWorkflowParams;
  }[])

  const childWorkflows = await env.INDEX_WORKFLOW.createBatch(batch)

  return childWorkflows.map(c => c.id)
}

export const indexStep = async (env: Env, ctx: ExecutionContext, event: WorkflowEvent<IndexWorkflowParams>) => {
  const { instanceId } = event
  const { owner, repo } = event.payload
  const shas = Object.entries(event.payload.pathMap)

  let childWorkflows = (await env.WORKFLOW_STATE.get(instanceId))?.split(',') ?? []

  if (childWorkflows.length === 0) {
    const [pathMap, treeData] = await fetchTrees(env, owner, repo, new Map(shas))
    const newPathMap = await process(env, ctx, owner, repo, treeData, pathMap)
    childWorkflows = await spawnIndexChildWorkflow(env, newPathMap, owner, repo)
  }

  await waitOnComplete(env, instanceId, childWorkflows)

  return shas.length
}
