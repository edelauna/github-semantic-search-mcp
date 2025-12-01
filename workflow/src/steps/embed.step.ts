import { RepoEntry } from "../types/types"
import { log } from "../utils/logging.utils"
import { EmbedWorkflowParams } from "../workflows/embed-repo.workflow"
import { EMBEDDING_MODEL, branch, createEmbeddings } from "../services/embed.service"
import { generateKey } from "../utils/shared-key.utils"
import { saveVectors } from "../services/vector.service"
import { TokenizedDocument } from "../services/document.service"

export const BATCH_SIZE = 32

export const doEmbeddings = async (env: Env, params: EmbedWorkflowParams, instanceId: string) => {
  const { owner, repo, githubTokenRef, idIndex } = params

  let hasMore = true

  // First, process any chunked files
  const chunkedFiles = await env.DB.prepare(
    'SELECT re.id, re.repo_id, re.oid, re.path, r.owner, r.name ' +
    'FROM repo_entry re ' +
    'JOIN repo r ON r.id = re.repo_id ' +
    'WHERE r.owner = ? AND r.name = ? ' +
    'AND EXISTS (SELECT 1 FROM chunk_queue cq WHERE cq.repo_entry_id = re.id AND cq.processed = 0) ' +
    'ORDER BY re.id LIMIT ?'
  ).bind(owner, repo, BATCH_SIZE).run<RepoEntry & { owner: string, name: string }>()

  for (const file of chunkedFiles.results) {
    await processFileChunks(env, file)
  }

  // Then process new files
  const { results } = await env.DB.prepare(
    'SELECT re.id, repo_id, oid, path, type, parent_repo_entry ' +
    'FROM repo_entry re ' +
    'JOIN repo r ON r.id = re.repo_id ' +
    'LEFT JOIN embedding_status es ON re.id = es.repo_entry_id ' +
    'WHERE r.owner = ? AND r.name = ? AND (es.repo_entry_id IS NULL OR es.status = \'pending\') AND re.id > ? ' +
    'ORDER BY re.id LIMIT ?'
  ).bind(owner, repo, idIndex, BATCH_SIZE).run<RepoEntry>()

  if (results.length === 0 && chunkedFiles.results.length === 0) {
    hasMore = false
    env.WORKFLOW_STATE.delete(githubTokenRef)
  } else {
    await createEmbeddings(env, owner, repo, results, githubTokenRef)
    const logResultsPromise = logResults(env, results)

    // Schedule next workflow if there's any work remaining (new files or chunked files)
    const shouldSchedule = results.length > 0 || chunkedFiles.results.length > 0
    if (shouldSchedule) {
      const nextIdIndex = results.length > 0 ? results[results.length - 1].id : idIndex
      await env.EMBED_WORKFLOW.create({
        id: crypto.randomUUID(),
        params: {
          owner,
          repo,
          githubTokenRef,
          idIndex: nextIdIndex,
          parentId: instanceId
        }
      })
    }
    await logResultsPromise
  }
  return hasMore
}

const logResults = async (env: Env, results: RepoEntry[]) => {
  const stmt = env.DB.prepare(`
    INSERT OR REPLACE INTO embedding_status (repo_entry_id, status, completed_at)
    SELECT ?, 'completed', DATETIME('now')
    WHERE NOT EXISTS (SELECT 1 FROM chunk_queue WHERE repo_entry_id = ? AND processed = 0)
  `)

  const batch = results.map((x => stmt.bind(x.id, x.id)))

  if (batch.length > 0) {
    log.info('logResults', `Recording completion status for ${batch.length} embeddings`);
    await env.DB.batch(batch)
  }
}

const processFileChunks = async (env: Env, file: RepoEntry & { owner: string, name: string }) => {
  const { id: repoEntryId, repo_id, oid, path, owner, name } = file

  // Get unprocessed chunks
  const { results: chunks } = await env.DB.prepare(
    'SELECT chunk_index FROM chunk_queue WHERE repo_entry_id = ? AND processed = 0 ORDER BY chunk_index LIMIT ?'
  ).bind(repoEntryId, BATCH_SIZE).run<{ chunk_index: number }>()


  try {
    if (chunks.length > 0) {
      // Load chunks from R2
      const chunksData = await env.github_semantic_search_bucket.get(`chunks/${repoEntryId}`)
      if (!chunksData) {
        log.error('processFileChunks', `Chunks data not found for repo_entry ${repoEntryId}`)
        return
      }

      const allDocs: TokenizedDocument[] = JSON.parse(await chunksData.text())
      const docsToProcess = chunks.map(c => allDocs[c.chunk_index])

      // Process embeddings
      const embeddingPromise = env.AI.run(EMBEDDING_MODEL, { text: docsToProcess.map(d => d.text) })
      const storagePromises = docsToProcess.map(d => {
        return env.github_semantic_search_bucket.put(generateKey(repo_id, branch, repoEntryId, d.lineRange), d.text)
      })

      const embeddings = await embeddingPromise

      const vectors = embeddings.data.map((item, index) => ({
        id: generateKey(repo_id, branch, repoEntryId, docsToProcess[index].lineRange),
        values: item,
        metadata: {
          oid,
          branch,
          owner,
          repo: name,
          path
        }
      }))

      await saveVectors(env, vectors)
      await Promise.all(storagePromises)

      // Mark chunks as processed
      const updateStmt = env.DB.prepare(
        'UPDATE chunk_queue SET processed = 1 WHERE repo_entry_id = ? AND chunk_index = ?'
      )
      const updateBatch = chunks.map(c => updateStmt.bind(repoEntryId, c.chunk_index))
      await env.DB.batch(updateBatch)
    }

    // Check if all chunks are now processed
    const { results: remaining } = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM chunk_queue WHERE repo_entry_id = ? AND processed = 0'
    ).bind(repoEntryId).run<{ count: number }>()

    if (remaining[0].count === 0) {
      await logResults(env, [{ id: repoEntryId } as RepoEntry])
      // Clean up completed chunk processing
      await env.DB.prepare('DELETE FROM chunk_queue WHERE repo_entry_id = ?').bind(repoEntryId).run()
      await env.github_semantic_search_bucket.delete(`chunks/${repoEntryId}`)
      log.info('processFileChunks', `Completed all chunks for repo_entry ${repoEntryId}`)
    }

    log.info('processFileChunks', `Processed ${chunks.length} chunks for repo_entry ${repoEntryId}`)
  } catch (e) {
    log.error('processFileChunks', `Error processing chunks for repo_entry ${repoEntryId}`, e)
  }
}
