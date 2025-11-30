-- Migration number: 0006 	 2025-11-29T14:15:00.000Z

CREATE TABLE chunk_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_entry_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  total_chunks INTEGER NOT NULL,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (repo_entry_id) REFERENCES repo_entry (id) ON DELETE CASCADE
);

ALTER TABLE embedding_status ADD COLUMN status TEXT DEFAULT 'pending';
