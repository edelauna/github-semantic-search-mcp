import { fetchText, TEXT_BATCH_PREFIX } from "../steps/github.step"
import { RepoEntry } from "../types/types"
import { GithubObjectBlob } from "../types/github.graphql.types"
import { makeDocuments, TokenizedDocument } from "../services/document.service"
import { generateKey } from "../utils/shared-key"
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
    const { path, oid, repo_id } = records.filter(x => x.id == parseInt(id))![0]
    try {
      const embeddingPromise = env.AI.run(
        EMBEDDING_MODEL,
        {
          text: docs.map(d => d.text),
        }
      );

      const storagePromises = docs.map(d => {
        return env.github_semantic_search_bucket.put(generateKey(repo_id, branch, parseInt(id), d.lineRange), d.text)
      })

      const embeddings = await embeddingPromise

      const vectors = embeddings.data.map((item, index) => ({
        id: generateKey(repo_id, branch, parseInt(id), docs[index].lineRange),
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
      log.error('createEmbeddings', `Swallowing error for repo_entry:${id}, with docs.length`, docs.length)
    }
  }
  return records
}

