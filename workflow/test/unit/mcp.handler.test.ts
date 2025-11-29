import { describe, it, expect } from 'vitest'
import { handleMCP } from '../../src/handlers/mcp.handler'
import { SERVER_CAPABILITIES, MCP_PROTOCOL_VERSION, SERVER_NAME, SERVER_VERSION, JsonRpcResponse } from '../../src/handlers/protocol'

describe('MCP Handler Unit Tests', () => {
  describe('SSE Connection', () => {
    it('should establish SSE connection with proper headers', async () => {
      const request = new Request('http://localhost/mcp', {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream'
        }
      })

      const response = await handleMCP(request)

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8')
      expect(response.headers.get('Cache-Control')).toMatch(/s-maxage=300/)
      expect(response.headers.get('Connection')).toBe('keep-alive')
      expect(response.headers.get('Mcp-Session-Id')).toBeTruthy()

      // Test SSE message format (static content)
      const bodyText = await response.text()
      expect(bodyText).toContain('id: static-open-id')
      expect(bodyText).toContain('event: open')
      expect(bodyText).toContain('"type":"connection"')
      expect(bodyText).toContain('"sessionId":"static-handshake"')
      expect(bodyText).toContain('event: endpoint')
    })

    it('should reject non-SSE requests', async () => {
      const request = new Request('http://localhost/mcp', {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      })

      const response = await handleMCP(request)
      expect(response.status).toBe(400)
    })
  })

  describe('Message Processing', () => {
    it('should handle initialize request', async () => {
      const request = new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: '1',
          method: 'initialize'
        })
      })

      const response = await handleMCP(request)
      const data = await response.json()

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

    it('should handle notifications/initialized', async () => {
      const request = new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/initialized'
        })
      })

      const response = await handleMCP(request)
      expect(response.status).toBe(202)
    })

    it('should handle tools/call with SSE response', async () => {
      const request = new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
          'Accept': 'text/event-stream',
          'Content-Type': 'application/json',
          'GITHUB_TOKEN': 'test'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: '1',
          method: 'tools/call',
          params: {
            name: 'github-semantic-search',
            arguments: {
              query: 'test',
              owner: 'test',
              repositoryName: 'test'
            }
          }
        })
      })

      const response = await handleMCP(request)
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('text/event-stream')
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

      const response = await handleMCP(request)
      const data = await response.json<JsonRpcResponse>()

      expect(response.status).toBe(400)
      expect(data.error?.code).toBe(-32700)
    })
  })

  describe('Error Handling', () => {
    it('should reject unsupported methods', async () => {
      const request = new Request('http://localhost/mcp', {
        method: 'PUT'
      })

      const response = await handleMCP(request)
      expect(response.status).toBe(405)
    })

    it('should handle unknown RPC methods', async () => {
      const request = new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: '1',
          method: 'unknown_method'
        })
      })

      const response = await handleMCP(request)
      const data = await response.json<JsonRpcResponse>()

      expect(response.status).toBe(200)
      expect(data.error?.code).toBe(-32601)
    })
  })
})
