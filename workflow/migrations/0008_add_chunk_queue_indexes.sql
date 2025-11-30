-- Migration number: 0008 	 2025-11-30T02:25:00.000Z

-- Add indexes for chunk queue performance
CREATE INDEX IF NOT EXISTS idx_chunk_queue_repo_processed ON chunk_queue (repo_entry_id, processed, chunk_index);

-- Add index for embedding status status queries
CREATE INDEX IF NOT EXISTS idx_embedding_status_status ON embedding_status (status);
