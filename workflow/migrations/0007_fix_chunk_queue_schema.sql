-- Migration number: 0007 	 2025-11-29T19:30:00.000Z

-- Drop current table
DROP TABLE chunk_queue;

-- Create new table with correct schema
CREATE TABLE chunk_queue (
  repo_entry_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  processed BOOLEAN DEFAULT 0,
  PRIMARY KEY (repo_entry_id, chunk_index),
  FOREIGN KEY (repo_entry_id) REFERENCES repo_entry (id) ON DELETE CASCADE
);
