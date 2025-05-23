// GitObjectID type
type GitObjectID = string;

// TreeEntry interface
interface TreeEntry {
  name: string;
  oid: GitObjectID;
  type: string;
}

// GitObject interface with type discrimination
interface GitObject {
  oid: GitObjectID;
  __typename: string;
}

// Tree interface
export interface Tree extends GitObject {
  __typename: 'Tree';
  entries?: TreeEntry[];
}

// Blob interface
export interface GithubObjectBlob extends GitObject {
  __typename: 'Blob';
  text?: string;
  isBinary?: boolean;
}

// Repository interface
interface Repository {
  [batchName: string]: Tree | GithubObjectBlob
}

// Result interface
export interface Result {
  repository?: Repository;
}
