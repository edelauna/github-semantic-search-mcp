import { describe, it, expect, beforeEach, vi } from 'vitest'
import { env, createExecutionContext } from 'cloudflare:test'
import app from '../../src/index'
import { SERVER_CAPABILITIES, MCP_PROTOCOL_VERSION, SERVER_NAME, SERVER_VERSION } from '../../src/handlers/protocol'

describe('MCP Server Integration Tests', () => {
  const mockEnv: Env = env

  const mockCtx = createExecutionContext()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /mcp', () => {
    it('should establish SSE connection with correct headers', async () => {
      const request = new Request('http://localhost/mcp', {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream'
        }
      })

      const response = await app.fetch(request, mockEnv, mockCtx)

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('text/event-stream')
      expect(response.headers.get('Cache-Control')).toBe('no-cache')
      expect(response.headers.get('Connection')).toBe('keep-alive')
      expect(response.headers.get('Mcp-Session-Id')).toBeTruthy()
    })

    it('should reject non-SSE requests', async () => {
      const request = new Request('http://localhost/mcp', {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      })

      const response = await app.fetch(request, mockEnv, mockCtx)
      expect(response.status).toBe(400)
    })
  })

  describe('POST /mcp', () => {
    it('should handle initialize request correctly', async () => {
      const initializeRequest = {
        jsonrpc: '2.0',
        id: '1',
        method: 'initialize'
      }

      const request = new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(initializeRequest)
      })

      const response = await app.fetch(request, mockEnv, mockCtx)
      const data = await response.json() as {
        jsonrpc: string;
        id: string;
        result: {
          protocolVersion: string;
          capabilities: typeof SERVER_CAPABILITIES;
          serverInfo: {
            name: string;
            version: string;
          };
        };
      }

      expect(response.status).toBe(200)
      expect(data).toEqual({
        jsonrpc: '2.0',
        id: '1',
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: SERVER_CAPABILITIES,
          serverInfo: {
            name: SERVER_NAME,
            version: SERVER_VERSION
          }
        }
      })
    })

    it('should handle tools/list request', async () => {
      const toolsListRequest = {
        jsonrpc: '2.0',
        id: '2',
        method: 'tools/list'
      }

      const request = new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(toolsListRequest)
      })

      const response = await app.fetch(request, mockEnv, mockCtx)
      const data = await response.json() as {
        jsonrpc: string;
        id: string;
        result: {
          tools: Array<{
            name: string;
            description: string;
            inputSchema: any;
          }>;
        };
      }

      expect(response.status).toBe(200)
      expect(data.jsonrpc).toBe('2.0')
      expect(data.id).toBe('2')
      expect(data.result.tools).toBeInstanceOf(Array)
      expect(data.result.tools.length).toBeGreaterThan(0)
    })

    it('should handle invalid JSON', async () => {
      const request = new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: 'invalid json'
      })

      const response = await app.fetch(request, mockEnv, mockCtx)
      const data = await response.json() as {
        jsonrpc: string;
        error: {
          code: number;
          message: string;
        };
      }

      expect(response.status).toBe(400)
      expect(data.error.code).toBe(-32700)
    })
  })
})
