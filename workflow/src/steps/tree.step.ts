import { deleteVectors } from "../services/vector.service";
import { Result, Tree } from "../types/github.graphql.types";
import { RepoEntry } from "../types/types";
import { log } from "../utils/logging.utils";

const compareAndPrune = (env: Env, ctx: ExecutionContext, oldTreeIds: Map<string, RepoEntry>, newTree: Tree) => {
  const newIds = new Map(newTree.entries?.map(entry => [entry.oid, entry]) || []);

  const stmt = env.DB.prepare('DELETE FROM repo_entry where id = ?')
  const batch = []
  const recordsToDelete = []
  for (const [oid, oldItem] of oldTreeIds) {
    if (!newIds.has(oid)) {
      batch.push(stmt.bind(oldItem.id))
      recordsToDelete.push(oldItem)
    }
  }

  if (batch.length > 0) {
    log.info('compareAndPrune', `Deleting ${batch.length} outdated entries`);
    ctx.waitUntil(env.DB.batch(batch))
  }
  if (recordsToDelete.length > 0) {
    log.info('compareAndPrune', `Deleting ${recordsToDelete.length} vector records`);
    ctx.waitUntil(deleteVectors(env, ctx, recordsToDelete))
  }
}

const fetchCurrentTreeFromDb = async (env: Env, path: string, owner: string, repo: string): Promise<Map<string, RepoEntry>> => {
  // Find the parent tree node
  const parentPath = path.replace(/\/$/, '');
  let result;

  if (parentPath) {
    result = await env.DB.prepare(
      'SELECT id, repo_id, oid, path, type, parent_repo_entry ' +
      'FROM repo_entry ' +
      'WHERE parent_repo_entry = (SELECT repo_entry.id ' +
      'FROM repo_entry ' +
      'JOIN repo ON repo.id = repo_entry.repo_id ' +
      'WHERE repo.owner = ? AND repo.name = ? AND repo_entry.path = ?)'
    ).bind(owner, repo, parentPath).run<RepoEntry>();
  } else {
    result = await env.DB.prepare(
      'SELECT repo_entry.id, repo_id, oid, path, type, parent_repo_entry ' +
      'FROM repo_entry ' +
      'JOIN repo ON repo.id = repo_entry.repo_id ' +
      'WHERE repo.owner = ? AND repo.name = ? AND parent_repo_entry IS NULL'
    ).bind(owner, repo).run<RepoEntry>();
  }

  return new Map(result.results.map(child => [child.oid, child]));
}

const checkForDeltas = async (env: Env, ctx: ExecutionContext, newTreeData: Tree, path: string, owner: string, repo: string): Promise<Map<string, RepoEntry>> => {
  const oldTreeIds = await fetchCurrentTreeFromDb(env, path, owner, repo);
  log.debug('checkForDeltas', `Found existing tree entries for path: ${path}`, oldTreeIds);
  compareAndPrune(env, ctx, oldTreeIds, newTreeData);
  return oldTreeIds;
}

export const processTree = async (
  env: Env,
  ctx: ExecutionContext,
  owner: string,
  repo: string,
  treeData: Result,
  pathMap: Map<string, string>
): Promise<Map<string, string>> => {

  const newTreeIds = new Map<string, string>();
  const repository = treeData.repository;
  const repoId = (await env.DB.prepare("SELECT id FROM repo WHERE name = ? and owner = ?")
    .bind(repo, owner).first<{ id: number }>())?.id

  log.info('processTree', `Processing repository: ${owner}/${repo}`, { repoId });
  if (!repoId) throw new Error(`Missing repoId for (owner, name) -> (${owner}, ${repo})`)

  for (const [key, treeDataNode] of Object.entries(repository || {})) {
    const basePath = pathMap.get(key);
    if (!basePath) continue;

    // Convert JSON-like object to our Tree type
    const tree = treeDataNode as Tree
    const treeOid = tree.oid;
    const oldTreeIds = await checkForDeltas(env, ctx, tree, basePath, owner, repo);

    const stmt = env.DB.prepare('INSERT INTO repo_entry (repo_id, oid, path, type, parent_repo_entry) ' +
      'VALUES (?, ?, ?, ?, ?)'
    )
    const batch: D1PreparedStatement[] = [];

    const promises = tree.entries?.map(async item => {
      const path = `${basePath}${item.name}`;

      if (['tree', 'blob'].includes(item.type)) {
        const parentTree = await env.DB.prepare('SELECT re.id FROM repo_entry re ' +
          'WHERE re.repo_id = ? AND path = ?'
        ).bind(repoId, basePath.replace(/\/$/, '')).first<{ id: number }>()

        if (!parentTree) {
          // this is expected at the root node
          log.debug('processTree', `No parent tree found (expected for root)`, {
            treeOid,
            path,
            itemOid: item.oid
          });
        }

        if (!oldTreeIds.has(item.oid)) {
          batch.push(stmt.bind(repoId, item.oid, path, item.type, parentTree?.id ?? null))
        }

        if (item.type === 'tree') {
          newTreeIds.set(`${path}/`, item.oid);
        }
      }
    });
    await Promise.all(promises ?? [])

    if (batch.length > 0) {
      log.info('processTree', `Batching ${batch.length} new entries for insertion`);
      ctx.waitUntil(env.DB.batch(batch))
    }
  }

  return newTreeIds;
}
