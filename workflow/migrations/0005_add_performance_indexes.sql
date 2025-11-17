-- Migration number: 0005 	 2025-11-17T23:05:50.924Z

CREATE INDEX idx_repo_owner_name ON repo (owner, name);

CREATE INDEX idx_repo_entry_repo_id ON repo_entry (repo_id);

CREATE INDEX idx_embedding_status_repo_entry_id ON embedding_status (repo_entry_id);
