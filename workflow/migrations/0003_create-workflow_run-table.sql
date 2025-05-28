-- Migration number: 0003 	 2025-05-25T01:19:14.286Z

CREATE TABLE workflow_run (
    id TEXT PRIMARY KEY,
    repo_id INTEGER NOT NULL,
    status TEXT NOT NULL,      -- e.g., "running", "completed", "failed", "cancelled"
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at DATETIME,
    FOREIGN KEY (repo_id) REFERENCES repo(id) ON DELETE CASCADE
);
