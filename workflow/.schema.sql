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
  FOREIGN KEY (repo_id) REFERENCES repo(id),
  FOREIGN KEY (parent_repo_entry) REFERENCES repo_entry(id)
);

CREATE TABLE outbox(
  type TEXT,
  external_id TEXT
)

-- DOCUMENT {
--     blob compressed_text
--     text oid
--     text url
-- }

-- VECTOR {
--     blob embeddings
--     text url
--     text repo_owner
--     text repo_name
-- }
