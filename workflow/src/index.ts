import { handleMCP } from './handlers/mcp.handler';
import { log } from './utils/logging.utils';

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(req.url);
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Mcp-Session-Id",
      "Access-Control-Allow-Methods": "GET, POST"
    }

    try {
      if (pathname === '/mcp') {
        if (req.method === 'GET' || req.method === 'POST') {
          return handleMCP(req);
        } else {
          return new Response("MCP endpoint only accepts GET and POST requests", {
            status: 405,
            headers: {
              ...headers,
              "Allow": "GET, POST"
            }
          });
        }
      } else {
        return new Response(null, {
          status: 302,
          headers: {
            ...headers,
            'Location': 'https://github.com/edelauna/github-semantic-search-mcp/tree/dev/workflow#github-semantic-search-mcp-server'
          }
        });
      }
    } catch (e) {
      log.error('index', 'Internal Server Error', e);
      return new Response("Internal Server Error", {
        status: 500,
        headers
      });
    }
  },
};

export { EmbedWorkflow } from './workflows/embed-repo.workflow'
export { IndexWorkflow } from './workflows/index-repo.workflow'
export { ScanWorkflow } from './workflows/scan-repo.workflow'
