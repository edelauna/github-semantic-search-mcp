// Server Information
export const SERVER_NAME = 'Github Code Semantic Search';
export const SERVER_VERSION = '0.0.1';
export const MCP_PROTOCOL_VERSION = '2025-03-26';

// Common Headers
export const COMMON_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Mcp-Session-Id"
} as const;

// Protocol Types
export interface JsonRpcMessage {
  jsonrpc: string;
  id: string | number | null;
  method: string;
  params?: any;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface MCPCapabilities {
  tools: { listChanged: boolean };
  prompts: { listChanged: boolean };
  resources: { listChanged: boolean };
  logging: { level: string };
  roots: { listChanged: boolean };
}

// Server Capabilities
export const SERVER_CAPABILITIES: MCPCapabilities = {
  tools: { listChanged: true },
  prompts: { listChanged: false },
  resources: { listChanged: false },
  logging: { level: "info" },
  roots: { listChanged: false }
};

// JSON-RPC Response Helper
export const jsonRpcResponse = (id: string | number | null, result: any = null, error: any = null): JsonRpcResponse => {
  const response: JsonRpcResponse = {
    jsonrpc: "2.0",
    id
  };

  if (error) {
    response.error = error;
  } else {
    response.result = result;
  }

  return response;
};
