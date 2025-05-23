import { Result } from "../types/github.graphql.types";

type FetchVariables = {
  owner: string,
  repo: string,
}

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql'

export const fetchTrees = async (env: Env, owner: string, repo: string, shas: Map<string, string>): Promise<[Map<string, string>, Result]> => {
  const [query, pathMap] = buildQuery(shas);
  const variables = {
    owner,
    repo,
  };

  return [pathMap, await makeBatchGraphQLRequest(env, query, variables)];
}

const buildQuery = (treeMap: Map<string, string>): [string, Map<string, string>] => {
  const batchMap = new Map<string, string>();
  let queryBuilder = `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
  `;

  let index = 0;
  for (const [path, expr] of treeMap.entries()) {
    const batchId = `batch_${index}`;
    queryBuilder += `
      ${batchId}: object(expression: "${expr}") {
        __typename
        ... on Tree {
          entries {
            name
            oid
            type
          }
          oid
        }
      }
    `;
    batchMap.set(batchId, path);
  }

  queryBuilder += `
      }
    }
  `;

  return [queryBuilder, batchMap];
}

const makeBatchGraphQLRequest = async (env: Env, query: string, variables: FetchVariables, maxRetries: number = 3): Promise<Result> => {
  const headers = {
    'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
    'Content-Type': 'application/json',
    'User-Agent': 'github-semantic-search-app'
  };

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(GITHUB_GRAPHQL_URL, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ query, variables }),
      });

      if (!response.ok) {
        throw new Error(`Unexpected response: ${response.status}`);
      }

      const result = await response.json<{ data: Result, errors: any[] }>();

      if (result.errors && result.errors.length > 0) {
        throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
      }

      return result.data;
    } catch (error: any) {
      if (attempt === maxRetries - 1) {

        throw new Error(`Failed to fetch data after ${maxRetries} attempts: ${error.message}`);
      }
      // Exponential backoff with jitter
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000) + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Unexpected error in makeBatchGraphQLRequest');
}


const buildTextQuery = (oidMap: { [key: string]: string }) => {
  const queryParts = []
  queryParts.push(`
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
    `.trim()
  )
  Object.entries(oidMap).forEach(([id, oid]) => {
    queryParts.push(`
      ${id}: object(oid: "${oid}") {
        __typename
        ... on Blob {
          text
          oid
          isBinary
        }
      }
      `.trim()
    )
  })
  queryParts.push('}}')
  return queryParts.join('')
}

export const fetchText = (env: Env, owner: string, repo: string, oidMap: { [key: string]: string }) => {
  const query = buildTextQuery(oidMap)
  const variables = {
    owner,
    repo
  }
  return makeBatchGraphQLRequest(env, query, variables)
}
