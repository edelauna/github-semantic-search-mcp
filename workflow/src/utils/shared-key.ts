import { Repo, RepoEntry } from "../types/types"
import { log } from "./logging.utils"

export const generateKey = (repo_id: number, branch: string, id: number, lineNumber: [number, number]) => (
  lineNumber[0] === lineNumber[1] ? `/${repo_id}/${branch}/${id}/L${lineNumber[0]}` :
    `/${repo_id}/${branch}/${id}/L${lineNumber[0]}-L${lineNumber[1]}`
)

export const generateURL = async (env: Env, vector_id: string) => {
  const [repo_id, branch, id, lineNumber] = vector_id.split('/')
  const repo = await env.DB.prepare('SELECT id, owner, name FROM repo WHERE id = ?').bind(repo_id).first<Repo>()
  if (!repo) {
    log.error('generateURL', `Repo not found for id: ${repo_id}`)
    return null
  }
  const repo_entry = await env.DB.prepare('SELECT path, type FROM repo_entry WHERE id = ?').bind(id).first<RepoEntry>()
  if (!repo_entry) {
    log.error('generateURL', `Repo entry not found for id: ${id}`)
    return null
  }

  return `https://github.com/${repo.owner}/${repo.name}/${repo_entry.type}/${branch}${repo_entry.path}#${lineNumber}`
}
