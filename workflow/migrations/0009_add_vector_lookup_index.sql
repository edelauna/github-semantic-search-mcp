-- Migration number: 0009 	 2025-11-30T05:51:00.000Z

CREATE INDEX idx_vectors_oid_path_repo_id ON vectors (oid, path, repo_id);
