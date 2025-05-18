import { Repo } from "../types/types"
import { wait } from "../utils/wait"

const STATE_KEY = 'scan-workflow'
const BATCH_SIZE = 8

export const scan = async (env: Env): Promise<number> => {
  const childWorkflows = (await env.WORKFLOW_STATE.get(STATE_KEY))?.split(',') ?? []
  let currentId = childWorkflows.reduce((prev, current) => prev = parseInt(current) > prev ? parseInt(current) : prev, 0)
  let processed = 0

  while (true) {
    const { results } = await env.DB.prepare('SELECT owner, name, id FROM repo WHERE id > ? LIMIT ?')
      .bind(currentId, BATCH_SIZE).all<Repo>()

    if (results.length == 0) break;

    const batch = results.map(result => ({
      id: result.id.toString(),
      params: {
        owner: result.owner,
        repo: result.name,
        pathMap: {
          '/': 'HEAD:'
        }
      }
    }))

    while (childWorkflows.length > BATCH_SIZE) {
      wait(1_000)
      const id = childWorkflows[0]
      const instance = await env.INDEX_WORKFLOW.get(id)
      const status = await instance.status();
      if (status.status === 'complete') {
        childWorkflows.shift();
      }
    }

    await env.INDEX_WORKFLOW.createBatch(batch)
    await env.WORKFLOW_STATE.put(STATE_KEY, childWorkflows.join(','))

    processed += results.length
    currentId = results.pop()!.id

  }

  while (childWorkflows.length > 0) {
    const id = childWorkflows[0]
    const instance = await env.INDEX_WORKFLOW.get(id)
    const status = await instance.status();
    if (status.status === 'complete') {
      childWorkflows.shift();
    }
  }
  await env.WORKFLOW_STATE.delete(STATE_KEY)
  return processed
}
