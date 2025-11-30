import { fetchText, TEXT_BATCH_PREFIX } from "../steps/github.step"
import { RepoEntry } from "../types/types"
import { GithubObjectBlob } from "../types/github.graphql.types"
import { makeDocuments, TokenizedDocument } from "../services/document.service"
import { generateKey } from "../utils/shared-key.utils"
import { saveVectors } from "./vector.service"
import { log } from "../utils/logging.utils"

// TODO: parameterize this
export const branch = 'HEAD'

export const EMBEDDING_MODEL = "@cf/baai/bge-small-en-v1.5"

export const createEmbeddings = async (env: Env, owner: string, repo: string, records: RepoEntry[], githubTokenRef: string) => {
  const oidMap = records.reduce((obj, { id, oid }) => {
    obj[`${id}`] = oid
    return obj
  }, {} as { [key: string]: string })
  const corpus = await fetchText(owner, repo, oidMap, githubTokenRef)
  const tokenizedDocumentMap = Object.entries(corpus.repository || {}).reduce((arr: [string, TokenizedDocument[]][], [key, value]) => {
    const data = value as GithubObjectBlob
    if (data.isBinary === false && data.text) arr.push([key.replace(TEXT_BATCH_PREFIX, ''), makeDocuments(data.text)])
    return arr
  }, [])

  // iterate through the documents one by one to upload to R2 and embeddings to Vectorize
  // all operations are idempotent so easily restartable if a differant `records` set is passed in
  while (tokenizedDocumentMap.length > 0) {
    const [id, docs] = tokenizedDocumentMap.pop()!
    const repoEntryId = parseInt(id)
    const { path, oid, repo_id } = records.filter(x => x.id == repoEntryId)![0]

    // Check if file has too many chunks - queue for chunked processing
    if (docs.length > 32) {
      try {
        // Store serialized chunks in R2
        await env.github_semantic_search_bucket.put(`chunks/${repoEntryId}`, JSON.stringify(docs))

        // Queue all chunk indices in smaller batches to avoid D1 CPU timeouts
        const stmt = env.DB.prepare(
          "INSERT OR IGNORE INTO chunk_queue (repo_entry_id, chunk_index) VALUES (?, ?)"
        )
        const QUEUE_INSERT_BATCH = 256
        for (let i = 0; i < docs.length; i += QUEUE_INSERT_BATCH) {
          const page = docs.slice(i, i + QUEUE_INSERT_BATCH)
          const batch = page.map((_, idx) => stmt.bind(repoEntryId, i + idx))
          await env.DB.batch(batch)
        }

        // Update status to processing_chunks (upsert to ensure row exists)
        await env.DB.prepare(
          "INSERT INTO embedding_status(repo_entry_id, status) VALUES (?, 'processing_chunks') " +
          "ON CONFLICT(repo_entry_id) DO UPDATE SET status=excluded.status"
        ).bind(repoEntryId).run()

        log.info('createEmbeddings', `Queued ${docs.length} chunks for repo_entry ${repoEntryId}`)
      } catch (e) {
        log.error('createEmbeddings', `Error queuing chunks for repo_entry ${repoEntryId}`, e)
      }
      continue // Skip normal processing for this file
    }

    try {
      const embeddingPromise = env.AI.run(
        EMBEDDING_MODEL,
        {
          text: docs.map(d => d.text),
        }
      );

      const storagePromises = docs.map(d => {
        return env.github_semantic_search_bucket.put(generateKey(repo_id, branch, repoEntryId, d.lineRange), d.text)
      })

      const embeddings = await embeddingPromise

      const vectors = embeddings.data.map((item, index) => ({
        id: generateKey(repo_id, branch, repoEntryId, docs[index].lineRange),
        values: item,
        metadata: {
          oid,
          branch,
          owner,
          repo,
          path
        }
      }))
      await saveVectors(env, vectors)
      await Promise.all(storagePromises)
    } catch (e) {
      log.error('createEmbeddings', 'Error creating embeddings', e)
      log.error('createEmbeddings', `Swallowing error for repo_entry:${repoEntryId}, with docs.length`, docs.length)
    }
  }
  return records
}

