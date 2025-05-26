// TODO: remove hard coded `blob` type in here - this still works for trees is want to reuse this as url
export const generateKey = (owner: string, repo: string, branch: string, path: string, lineNumber: [number, number]) => (
  lineNumber[0] === lineNumber[1] ? `/${owner}/${repo}/${branch}${path}#L${lineNumber[0]}` :
    `/${owner}/${repo}/blob/${branch}${path}#L${lineNumber[0]}-L${lineNumber[1]}`
)
