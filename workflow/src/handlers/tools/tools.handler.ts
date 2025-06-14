import { handleGitHubSemanticSearch } from './github-semantic-search/github-semantic-search.tool';
import { JsonRpcMessage, jsonRpcResponse, JsonRpcResponse } from "../protocol";
import { env } from 'cloudflare:workers';
import { log } from '../../utils/logging.utils';

const GITHUB_SEMANT_SEARCH = 'github-semantic-search';

interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: {
      [key: string]: {
        type: string;
        description: string;
      };
    };
    required: string[];
  };
}

export interface ToolCallResponse {
  content: ContentItem[];
  isError: boolean;
}

interface ContentItem {
  type: "text";
  text: string;
}

// Tool Definitions
const AVAILABLE_TOOLS: Tool[] = [
  {
    name: GITHUB_SEMANT_SEARCH,
    description: "Search for similar code in a GitHub repository using semantic embeddings.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query for finding similar code." },
        owner: { type: "string", description: "The GitHub repository owner (e.g., 'octocat')." },
        repositoryName: { type: "string", description: "The GitHub repository name (e.g., 'hello-world')." },
      },
      required: ["query", "owner", "repositoryName"]
    }
  }
];

// Handler for Tools List
export const handleToolsList = (message: JsonRpcMessage): JsonRpcResponse => {
  const response = jsonRpcResponse(message.id, { tools: AVAILABLE_TOOLS });
  return response;
};

// Handler for Tools Call
export const handleToolsCall = async (message: JsonRpcMessage, headers: Headers): Promise<JsonRpcResponse> => {
  const params = message.params ?? {};
  const name = params.name;

  if (!name) {
    return jsonRpcResponse(message.id, null, { code: -32602, message: "Missing required parameter: name" });
  }

  const tool = AVAILABLE_TOOLS.find(t => t.name === name);
  if (!tool) {
    return handleUnknownTool(message, name);
  }

  switch (name) {
    case GITHUB_SEMANT_SEARCH:
      return handleSemanticSearchTool(message, params, headers);
    default:
      return handleUnknownTool(message, name);
  }
};

// Handle Unknown Tool
const handleUnknownTool = (message: JsonRpcMessage, name: string): JsonRpcResponse => {
  return jsonRpcResponse(message.id, null, { code: -32601, message: `Unknown tool: ${name}` });
};

// Handle Semantic Search Tool
const handleSemanticSearchTool = async (message: JsonRpcMessage, params: any, headers: Headers): Promise<JsonRpcResponse> => {
  const GITHUB_TOKEN = headers?.get('GITHUB_TOKEN');  // Extract GITHUB_TOKEN from headers

  if (!GITHUB_TOKEN) {
    return jsonRpcResponse(message.id, null, {
      code: -32602,
      message: "Missing required header. Need: GITHUB_TOKEN"
    });
  }

  const args = params.arguments ?? {};
  const { query, owner, repositoryName } = args;

  if (!query || !owner || !repositoryName || !GITHUB_TOKEN) {
    return jsonRpcResponse(message.id, null, {
      code: -32602,
      message: "Missing required parameters. Need: query, owner, repositoryName"
    });
  }

  try {
    const response = await handleGitHubSemanticSearch(
      query,
      owner,
      repositoryName,
      GITHUB_TOKEN,
      env
    );

    return jsonRpcResponse(message.id, response);
  } catch (e) {
    log.error('handleSemanticSearchTool', `Error performing ${GITHUB_SEMANT_SEARCH}:`, e);
    return jsonRpcResponse(message.id, null, {
      code: -32603,
      message: `Internal error: ${e instanceof Error ? e.message : String(e)}`
    });
  }
};
