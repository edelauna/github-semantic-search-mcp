import { updateVectors } from "../services/vector.service"
import { RepoEntry } from "../types/types"
import { log } from "../utils/logging.utils"

const BATCH_SIZE = 10
const CONCURRENCY = 8

export const doEmbeddings = async (env: Env, owner: string, repo: string, githubTokenRef: string) => {
  let idIndex = 0
  let hasMore = true
  let queue: Promise<RepoEntry[]>[] = []

  while (hasMore) {
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
    } else {
      idIndex = results[results.length - 1].id
      queue.push(updateVectors(env, owner, repo, results, githubTokenRef))
    }

    if (queue.length >= CONCURRENCY) {
      await logResults(env, queue)
    }
  }
  await logResults(env, queue)
}

const logResults = async (env: Env, arr: Promise<RepoEntry[]>[]) => {
  const stmt = env.DB.prepare("INSERT INTO embedding_status (repo_entry_id, completed_at) VALUES (?, DATETIME('now'))")
  const data = await Promise.all(arr)

  const batch = data.reduce((acc, records) =>
    [...acc, ...records.map(x => stmt.bind(x.id))], [] as D1PreparedStatement[])

  if (batch.length > 0) {
    log.info('logResults', `Recording completion status for ${batch.length} embeddings`);
    await env.DB.batch(batch)
  }
  arr.length = 0
}
