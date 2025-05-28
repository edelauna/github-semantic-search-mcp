export const OUTBOX_TYPE = {
  INDEX: 'index',
} as const;

export type OUTBOX_TYPE = (typeof OUTBOX_TYPE)[keyof typeof OUTBOX_TYPE];

export type Repo = {
  'name': string,
  'owner': string,
  'id': number
}

export type RepoEntry = {
  'id': number,
  'repo_id': number,
  'oid': string,
  'path': string,
  'type': 'blob' | 'tree',
  'parent_repo_entry'?: number,
}

export type WorkflowRun = {
  'id': string,
  'repo_id': number,
  'status': 'running' | 'completed' | 'failed' | 'cancelled',
  'created_at': string,
  'last_updated_at': string,
}

export type Vector = {
  'id': string,
  'embeddings': string,
  'oid': string,
  'branch': string,
  'path': string,
  'repo_id': number
}

export type VectorizeVector = {
  'id': string,
  'values': number[],
  'metadata': {
    'oid': string,
    'branch': string,
    'owner': string,
    'repo': string,
    'path': string
  }
}
