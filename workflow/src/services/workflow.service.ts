
import { WorkflowRun } from "../types/types";
import { encryptedString } from "../utils/crpyto.utils";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const checkWorkflowStatus = async (owner: string, repo: string, db: D1Database): Promise<{
  hasWorkflow: boolean;
  lastCompleted: string | null;
  needsReindex: boolean;
}> => {
  const repoId = await db.prepare(
    'SELECT id FROM repo WHERE name = ? AND owner = ?'
  ).bind(repo, owner).first<{ id: number }>();

  if (!repoId) {
    await db.prepare('INSERT INTO repo (name, owner) VALUES (?, ?)').bind(repo, owner).run()
    return { hasWorkflow: false, lastCompleted: null, needsReindex: false };
  }

  const result = await db.prepare(`
    SELECT w.id, w.last_updated_at, w.status
    FROM workflow_run w
    JOIN repo r ON w.repo_id = r.id
    WHERE r.owner = ? AND r.name = ?
    ORDER BY w.last_updated_at DESC
    LIMIT 1
  `).bind(owner, repo).first<WorkflowRun>();

  if (!result) {
    return { hasWorkflow: false, lastCompleted: null, needsReindex: false };
  }

  const lastCompleted = result.last_updated_at;

  // running workflows should not take more than day see default retry: https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/#retry-steps
  const needsReindex = new Date().getTime() - new Date(lastCompleted).getTime() > ONE_DAY_MS

  return {
    hasWorkflow: true,
    lastCompleted,
    needsReindex
  };
}

export const triggerIndexing = async (owner: string, repo: string, githubToken: string, env: Env): Promise<void> => {
  const repoResult = await env.DB.prepare(
    'SELECT id FROM repo WHERE name = ? AND owner = ?'
  ).bind(repo, owner).first<{ id: number }>();

  const githubTokenRef = crypto.randomUUID()
  const encryptedToken = await encryptedString(githubToken)
  env.WORKFLOW_STATE.put(githubTokenRef, encryptedToken)

  const workflowInstance = await env.INDEX_WORKFLOW.create({
    id: crypto.randomUUID(),
    params: {
      owner,
      repo,
      githubTokenRef,
      pathMap: {
        '/': 'HEAD:'
      }
    }
  });

  await env.DB.prepare('INSERT INTO workflow_run (id, repo_id, status, last_updated_at) VALUES (?, ?, ?, ?)')
    .bind(workflowInstance.id, repoResult!.id, 'running', new Date().toISOString()).run()
}
