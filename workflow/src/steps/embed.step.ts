import { updateVectors } from "../services/vector.service"
import { RepoEntry } from "../types/types"
import { log } from "../utils/logging.utils"
import { EmbedWorkflowParams } from "../workflows/embed-repo.workflow"

export const BATCH_SIZE = 32

export const doEmbeddings = async (env: Env, params: EmbedWorkflowParams, instanceId: string) => {
  const { owner, repo, githubTokenRef, idIndex, parentId } = params

  let hasMore = true

  const { results } = await env.DB.prepare(
    'SELECT re.id, repo_id, oid, path, type, parent_repo_entry ' +
    'FROM repo_entry re ' +
    'JOIN repo r ON r.id = re.repo_id ' +
    'LEFT JOIN embedding_status es ON re.id = es.repo_entry_id ' +
    'WHERE r.owner = ? AND r.name = ? AND es.repo_entry_id IS NULL AND re.id > ? ' +
    'ORDER BY re.id LIMIT ?'
  ).bind(owner, repo, idIndex, BATCH_SIZE).run<RepoEntry>()

  if (results.length === 0) {
    hasMore = false
    env.WORKFLOW_STATE.delete(githubTokenRef)
  } else {
    await updateVectors(env, owner, repo, results, githubTokenRef)
    const logResultsPromise = logResults(env, results)
    await env.EMBED_WORKFLOW.create({
      id: crypto.randomUUID(),
      params: {
        owner,
        repo,
        githubTokenRef,
        idIndex: results[results.length - 1].id,
        parentId: instanceId
      }
    })
    await logResultsPromise
  }
  if (parentId) {
    const workflowInstance = await env.EMBED_WORKFLOW.get(parentId)
    await workflowInstance.sendEvent({ type: 'embeddings-complete', payload: null })
  }
  return hasMore
}

const logResults = async (env: Env, results: RepoEntry[]) => {
  const stmt = env.DB.prepare("INSERT INTO embedding_status (repo_entry_id, completed_at) VALUES (?, DATETIME('now'))")

  const batch = results.map((x => stmt.bind(x.id)))

  if (batch.length > 0) {
    log.info('logResults', `Recording completion status for ${batch.length} embeddings`);
    await env.DB.batch(batch)
  }
}
