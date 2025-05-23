import { fetchText } from "../steps/github.step"
import { RepoEntry } from "../types/types"
import { GithubObjectBlob } from "../types/github.graphql.types"
import { makeDocuments, TokenizedDocument } from "../services/document.service"
import { generateKey } from "../utils/shared-key"

// TODO: parameterize this
const branch = 'HEAD'

export const createEmbeddings = async (env: Env, owner: string, repo: string, records: RepoEntry[]) => {
  const oidMap = records.reduce((obj, { id, oid }) => {
    obj[`${id}`] = oid
    return obj
  }, {} as { [key: string]: string })
  const corpus = await fetchText(env, owner, repo, oidMap)
  const tokenizedDocumentMap = Object.entries(corpus.repository || {}).reduce((arr: [string, TokenizedDocument[]][], [key, value]) => {
    const data = value as GithubObjectBlob
    if (data.isBinary === false && data.text) arr.push([key, makeDocuments(data.text)])
    return arr
  }, [])

  // iterate through the documents one by one to upload to R2 and embeddings to Vectorize
  // all operations are idempotent so easily restartable if a differant `records` set is passed in
  while (tokenizedDocumentMap.length > 0) {
    const [id, docs] = tokenizedDocumentMap.pop()!
    const { path, oid } = records.filter(x => x.id == parseInt(id))![0]
    const embeddingPromise = env.AI.run(
      "@cf/baai/bge-small-en-v1.5",
      {
        text: docs.map(d => d.text),
      }
    );

    const storagePromises = docs.map(d => {
      return env.github_semantic_search_bucket.put(generateKey(owner, repo, branch, path, d.lineRange), d.text)
    })

    const embeddings = await embeddingPromise

    const vectors = embeddings.data.map((item, index) => ({
      id: generateKey(owner, repo, branch, path, docs[index].lineRange),
      values: item,
      metadata: {
        oid,
        branch,
        owner,
        repo,
        path
      }
    }))
    await env.VECTORIZE.insert(vectors)
    await Promise.all(storagePromises)
  }
  return records
}

