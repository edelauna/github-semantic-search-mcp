PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE d1_migrations(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE repo(
  name TEXT,
  owner TEXT,
  id INTEGER PRIMARY KEY
);
CREATE TABLE repo_entry(
  id INTEGER PRIMARY KEY,
  repo_id INTEGER,
  oid TEXT,
  path TEXT,
  type TEXT,
  parent_repo_entry INTEGER,
  FOREIGN KEY (repo_id) REFERENCES repo(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_repo_entry) REFERENCES repo_entry(id)
);
CREATE TABLE embedding_status (
  repo_entry_id INTEGER PRIMARY KEY,
  completed_at DATETIME, status TEXT DEFAULT 'pending',
  FOREIGN KEY (repo_entry_id) REFERENCES repo_entry(id) ON DELETE CASCADE
);
CREATE TABLE workflow_run (
    id TEXT PRIMARY KEY,
    repo_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at DATETIME,
    FOREIGN KEY (repo_id) REFERENCES repo(id) ON DELETE CASCADE
);
CREATE TABLE vectors (
  id TEXT PRIMARY KEY,
  embeddings BLOB,
  repo_id INTEGER,
  oid TEXT,
  branch TEXT,
  path TEXT,
  FOREIGN KEY (repo_id) REFERENCES repo(id)
);
CREATE TABLE chunk_queue (
  repo_entry_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  processed BOOLEAN DEFAULT 0,
  PRIMARY KEY (repo_entry_id, chunk_index),
  FOREIGN KEY (repo_entry_id) REFERENCES repo_entry (id) ON DELETE CASCADE
);
DELETE FROM sqlite_sequence;
CREATE INDEX idx_repo_owner_name ON repo (owner, name);
CREATE INDEX idx_repo_entry_repo_id ON repo_entry (repo_id);
CREATE INDEX idx_embedding_status_repo_entry_id ON embedding_status (repo_entry_id);
