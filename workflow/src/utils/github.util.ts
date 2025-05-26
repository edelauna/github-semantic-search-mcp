import { GITHUB_GRAPHQL_URL } from "../steps/github.step";

interface RepoAccessQuery {
  repository: {
    id: string;
  };
}

export const checkRepoAccess = async (owner: string, repo: string, token: string) => {
  const query = `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        id
      }
    }
  `;

  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'github-semantic-search-app'
    },
    body: JSON.stringify({
      query,
      variables: { owner, repo }
    })
  });

  if (!response.ok) {
    return false;
  }

  const data = await response.json() as { data?: RepoAccessQuery };
  return data.data?.repository?.id !== undefined;
}
