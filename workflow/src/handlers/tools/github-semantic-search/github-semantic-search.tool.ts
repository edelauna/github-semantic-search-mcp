import { encode } from 'gpt-tokenizer';
import { ToolCallResponse } from '../tools.handler';
import { DOCUMENTS_MAX_TOKENS } from '../../../services/document.service';
import { checkRepoAccess } from '../../../utils/github.util';
import { checkWorkflowStatus, triggerIndexing } from '../../../services/workflow.service';
import { branch, EMBEDDING_MODEL } from '../../../services/embed.service';

const MAX_TOKENS = DOCUMENTS_MAX_TOKENS;

export async function handleGitHubSemanticSearch(
  query: string,
  owner: string,
  repositoryName: string,
  githubToken: string,
  env: Env
): Promise<ToolCallResponse> {
  try {
    // 1. Check token length
    const tokenCount = encode(query).length;
    if (tokenCount > MAX_TOKENS) {
      return {
        content: [{
          type: "text",
          text: `Query is too long (${tokenCount} tokens). Please keep it under ${MAX_TOKENS} tokens.`
        }],
        isError: true
      };
    }

    // 2. Check repository access
    const repoAccess = await checkRepoAccess(owner, repositoryName, githubToken);
    if (!repoAccess) {
      return {
        content: [{
          type: "text",
          text: "The Github Token provided does not have access to this repository or the repository doesn't exist."
        }],
        isError: true
      };
    }

    // 3. Check workflow status
    const { hasWorkflow, lastCompleted, needsReindex } = await checkWorkflowStatus(owner, repositoryName, env.DB);

    if (!hasWorkflow) {
      // Kick off initial indexing
      await triggerIndexing(owner, repositoryName, githubToken, env);
      return {
        content: [{
          type: "text",
          text: "Repository hasn't been indexed yet. Indexing has been initiated - please try again in a few minutes."
        }],
        isError: false
      };
    }

    if (needsReindex) {
      // Kick off reindexing in the background
      await triggerIndexing(owner, repositoryName, githubToken, env);
    }

    // 4. Generate embeddings for the query
    const embedding = await env.AI.run(EMBEDDING_MODEL, { text: query });

    // 5. Perform vector search
    const results = await env.VECTORIZE.query(embedding.data[0], {
      topK: 7,
      filter: {
        owner: { $eq: owner },
        repo: { $eq: repositoryName },
        branch: { $eq: branch } // todo parameterize this
      }
    });

    // 6. Format response
    results.matches.forEach(x => x.id)
    const resultText = await Promise.all(results.matches.map(async match => (await env.github_semantic_search_bucket.get(match.id))?.text()));
    const lastUpdated = lastCompleted ? new Date(lastCompleted).toLocaleString() : 'unknown date';

    return {
      content: [{
        type: "text",
        text: `Results from index last updated ${lastUpdated}${needsReindex ? ' (Reindexing in progress)' : ''}:\n\n${resultText.filter(r => r !== undefined).map(r =>
          `${r}\n`
        ).join('\n---\n')
          }`
      }],
      isError: false
    };

  } catch (error) {
    console.error('Error in GitHub semantic search:', error);
    return {
      content: [{
        type: "text",
        text: `Error performing semantic search: ${error instanceof Error ? error.message : 'Unknown error'}`
      }],
      isError: true
    };
  }
}
