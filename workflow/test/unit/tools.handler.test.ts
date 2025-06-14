import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleToolsList, handleToolsCall, type ToolCallResponse } from '../../src/handlers/tools/tools.handler'
import * as githubSearchTool from '../../src/handlers/tools/github-semantic-search/github-semantic-search.tool'

// Mock the GitHub semantic search tool
vi.spyOn(githubSearchTool, 'handleGitHubSemanticSearch').mockResolvedValue({
  content: [{
    type: 'text',
    text: 'Test results'
  }],
  isError: false
})

describe('Tools Handler Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

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

      const headers = new Headers();
      const response = await handleToolsCall(message, headers)

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

      const headers = new Headers();
      const response = await handleToolsCall(message, headers)

      expect(response.jsonrpc).toBe('2.0')
      expect(response.id).toBe('1')
      expect(response.error).toBeDefined()
      expect(response.error?.code).toBe(-32601)
    })

    describe('github-semantic-search tool', () => {
      it('should validate required parameters', async () => {
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

        const headers = new Headers();
        // No GITHUB_TOKEN header set
        const response = await handleToolsCall(message, headers)

        expect(response.jsonrpc).toBe('2.0')
        expect(response.id).toBe('1')
        expect(response.error).toBeDefined()
        expect(response.error?.code).toBe(-32602)
        expect(response.error?.message).toMatch(/Missing required header. Need: GITHUB_TOKEN/)
      })

      it('should handle successful tool execution', async () => {
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
            }
          }
        }

        const mockResponse: ToolCallResponse = {
          content: [{
            type: 'text' as const,
            text: 'Test results'
          }],
          isError: false
        }

        vi.mocked(githubSearchTool.handleGitHubSemanticSearch).mockResolvedValueOnce(mockResponse)

        const headers = new Headers();
        headers.set('GITHUB_TOKEN', 'test-token');
        const response = await handleToolsCall(message, headers)

        expect(response.jsonrpc).toBe('2.0')
        expect(response.id).toBe('1')
        expect(response.result).toEqual(mockResponse)
        expect(githubSearchTool.handleGitHubSemanticSearch).toHaveBeenCalledWith(
          'test query',
          'test-owner',
          'test-repo',
          'test-token',
          expect.anything()
        )
      })

      it('should handle tool execution errors', async () => {
        const message = {
          jsonrpc: '2.0',
          id: '1',
          method: 'tools/call',
          params: {
            name: 'github-semantic-search',
            arguments: {
              query: 'test query',
              owner: 'test-owner',
              repositoryName: 'test-repo'
            }
          }
        }

        const mockError = new Error('Test error')
        vi.mocked(githubSearchTool.handleGitHubSemanticSearch).mockRejectedValueOnce(mockError)

        const headers = new Headers();
        headers.set('GITHUB_TOKEN', 'test-token');
        const response = await handleToolsCall(message, headers)

        expect(response.jsonrpc).toBe('2.0')
        expect(response.id).toBe('1')
        expect(response.error).toBeDefined()
        expect(response.error?.code).toBe(-32603)
        expect(response.error?.message).toBe('Internal error: Test error')
      })
    })
  })
})
