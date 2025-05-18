-- Migration number: 0001 	 2025-05-06T01:34:31.098Z

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
