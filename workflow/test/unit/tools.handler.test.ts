import { describe, it, expect } from 'vitest'
import { handleToolsList, handleToolsCall } from '../../src/handlers/tools/tools.handler'

describe('Tools Handler Unit Tests', () => {
  describe('handleToolsList', () => {
    it('should return list of available tools', () => {
      const message = {
        jsonrpc: '2.0',
        id: '1',
        method: 'tools/list'
      }

      const response = handleToolsList(message)

      expect(response.jsonrpc).toBe('2.0')
      expect(response.id).toBe('1')
      expect(response.result.tools).toBeInstanceOf(Array)
      expect(response.result.tools.length).toBeGreaterThan(0)

      // Verify tool schema
      const tool = response.result.tools[0]
      expect(tool).toHaveProperty('name')
      expect(tool).toHaveProperty('description')
      expect(tool).toHaveProperty('inputSchema')
      expect(tool.inputSchema).toHaveProperty('type', 'object')
      expect(tool.inputSchema).toHaveProperty('properties')
      expect(tool.inputSchema).toHaveProperty('required')
    })
  })

  describe('handleToolsCall', () => {
    it('should reject calls without tool name', async () => {
      const message = {
        jsonrpc: '2.0',
        id: '1',
        method: 'tools/call',
        params: {}
      }

      const response = await handleToolsCall(message)

      expect(response.jsonrpc).toBe('2.0')
      expect(response.id).toBe('1')
      expect(response.error).toBeDefined()
      expect(response.error?.code).toBe(-32602)
    })

    it('should reject calls to unknown tools', async () => {
      const message = {
        jsonrpc: '2.0',
        id: '1',
        method: 'tools/call',
        params: {
          name: 'non-existent-tool'
        }
      }

      const response = await handleToolsCall(message)

      expect(response.jsonrpc).toBe('2.0')
      expect(response.id).toBe('1')
      expect(response.error).toBeDefined()
      expect(response.error?.code).toBe(-32601)
    })

    it('should validate github-semantic-search required parameters', async () => {
      const message = {
        jsonrpc: '2.0',
        id: '1',
        method: 'tools/call',
        params: {
          name: 'github-semantic-search',
          arguments: {
            // Missing required parameters
          }
        }
      }

      const response = await handleToolsCall(message)

      expect(response.jsonrpc).toBe('2.0')
      expect(response.id).toBe('1')
      expect(response.error).toBeDefined()
      expect(response.error?.code).toBe(-32602)
    })

    it('should handle github-semantic-search with valid parameters', async () => {
      const message = {
        jsonrpc: '2.0',
        id: '1',
        method: 'tools/call',
        params: {
          name: 'github-semantic-search',
          arguments: {
            query: 'test query',
            owner: 'test-owner',
            repositoryName: 'test-repo',
            GITHUB_TOKEN: 'test-token'
          }
        }
      }

      const response = await handleToolsCall(message)

      expect(response.jsonrpc).toBe('2.0')
      expect(response.id).toBe('1')
      expect(response.result).toBeDefined()
      expect(response.result.content).toBeInstanceOf(Array)
      expect(response.result.isError).toBe(false)
    })
  })
})
