import { RepoEntry, Vector, VectorizeVector } from "../types/types";
import { createEmbeddings } from "./embed.service";
import { log } from "../utils/logging.utils";

export const blobToVector = (string: string) => {
  // looks like workers don't support true blobs
  return string.split(',').map(Number)
};

export const vectorToBlob = (vector: number[]): string => {
  return vector.join(',')
};

export const updateVectors = async (env: Env, owner: string, repo: string, records: RepoEntry[], githubTokenRef: string) => {
  const stmt = env.DB.prepare('SELECT vectors.id, vectors.embeddings, vectors.oid, vectors.branch, vectors.path, vectors.repo_id ' +
    'FROM vectors ' +
    'JOIN repo ON vectors.repo_id = repo.id ' +
    'WHERE repo.owner = ? AND repo.name = ? AND vectors.oid = ? AND vectors.path = ?');
  const batch = records.map(r => stmt.bind(owner, repo, r.oid, r.path));

  const vectorBatch = await env.DB.batch<Vector>(batch);

  const { newRecords, vectors } = vectorBatch.reduce((acc, { results }) => {
    results.forEach((r) => {
      acc.newRecords = acc.newRecords.filter((f) => (f.oid !== r.oid && f.path !== r.path)); // already scoped to owner:repo
      acc.vectors.push({
        id: r.id,
        values: blobToVector(r.embeddings),
        metadata: {
          oid: r.oid,
          branch: r.branch,
          owner,
          repo,
          path: r.path
        }
      });
    });
    return acc;
  }, { newRecords: records, vectors: [] } as { newRecords: RepoEntry[], vectors: VectorizeVector[] });

  const addVectorPromise = env.VECTORIZE.insert(vectors)
  if (newRecords.length > 0) {
    await createEmbeddings(env, owner, repo, newRecords, githubTokenRef)
  }
  await addVectorPromise

  return records;
}

export const saveVectors = async (env: Env, vectors: VectorizeVector[]) => {
  const stmt = env.DB.prepare(`
    INSERT INTO vectors (id, embeddings, oid, branch, path, repo_id)
    SELECT ?, ?, ?, ?, ?, repo.id
    FROM repo
    WHERE repo.owner = ? AND repo.name = ?
  `);
  const batch = vectors.map(v => stmt.bind(v.id, vectorToBlob(v.values), v.metadata.oid, v.metadata.branch, v.metadata.path, v.metadata.owner, v.metadata.repo));

  try {
    await env.DB.batch(batch)
    await env.VECTORIZE.insert(vectors)
  } catch (error) {
    log.error('saveVectors', 'Error saving vectors', error)
    throw error
  }
}

export const deleteVectors = async (env: Env, ctx: ExecutionContext, records: RepoEntry[]) => {
  const stmt = env.DB.prepare('SELECT id from vectors where oid = ? and path = ? and repo_id = ?')
  const batch = records.map(r => stmt.bind(r.oid, r.path, r.repo_id));
  const vectorBatch = await env.DB.batch<{ id: string }>(batch);
  const ids = vectorBatch.reduce((acc, { results }) => [...acc, ...results.map(r => r.id)], [] as string[])
  ctx.waitUntil(env.VECTORIZE.deleteByIds(ids))
}
