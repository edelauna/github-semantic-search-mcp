-- Migration number: 0002 	 2025-05-22T01:29:49.374Z

CREATE TABLE embedding_status (
  repo_entry_id INTEGER PRIMARY KEY,
  completed_at DATETIME,
  FOREIGN KEY (repo_entry_id) REFERENCES repo_entry(id)
);
