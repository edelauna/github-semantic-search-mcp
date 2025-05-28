-- Migration number: 0004 	 2025-05-27T02:31:46.030Z

CREATE TABLE vectors (
  id TEXT PRIMARY KEY,
  embeddings BLOB,
  repo_id INTEGER,
  oid TEXT,
  branch TEXT,
  path TEXT,
  FOREIGN KEY (repo_id) REFERENCES repo(id)
);
