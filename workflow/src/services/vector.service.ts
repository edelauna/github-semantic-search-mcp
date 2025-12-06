import { RepoEntry, VectorizeVector } from "../types/types";
import { log } from "../utils/logging.utils";

export const saveVectors = async (env: Env, vectors: VectorizeVector[]) => {
  // Save vector IDs to D1 for deletion tracking (without the blob data)
  const stmt = env.DB.prepare(`
    INSERT OR REPLACE INTO vectors (id, oid, branch, path, repo_id)
    SELECT ?, ?, ?, ?, repo.id
    FROM repo
    WHERE repo.owner = ? AND repo.name = ?
  `);
  const batch = vectors.map(v => stmt.bind(v.id, v.metadata.oid, v.metadata.branch, v.metadata.path, v.metadata.owner, v.metadata.repo));

  try {
    await env.DB.batch(batch)
    await env.VECTORIZE.insert(vectors)
  } catch (error) {
    log.error('saveVectors', `Error saving ${vectors.length} vectors`, error)
    throw error
  }
}

export const deleteVectors = async (env: Env, ctx: ExecutionContext, records: RepoEntry[]) => {
  const stmt = env.DB.prepare('SELECT id from vectors where oid = ? and path = ? and repo_id = ?')
  const batch = records.map(r => stmt.bind(r.oid, r.path, r.repo_id));
  const vectorBatch = await env.DB.batch<{ id: string }>(batch);
  const ids = vectorBatch.reduce((acc, { results }) => [...acc, ...results.map(r => r.id)], [] as string[])

  // Delete from D1
  if (ids.length > 0) {
    const deleteStmt = env.DB.prepare('DELETE FROM vectors WHERE id = ?')
    const deleteBatch = ids.map(id => deleteStmt.bind(id))
    await env.DB.batch(deleteBatch)
  }

  // Delete from Vectorize
  ctx.waitUntil(env.VECTORIZE.deleteByIds(ids))
}
