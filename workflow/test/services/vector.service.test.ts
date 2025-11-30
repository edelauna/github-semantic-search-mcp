import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { env, createExecutionContext } from 'cloudflare:test'
import { saveVectors, deleteVectors } from '../../src/services/vector.service'
import { RepoEntry, VectorizeVector } from '../../src/types/types'
import * as embedService from '../../src/services/embed.service'

vi.spyOn(embedService, 'createEmbeddings').mockImplementation(async (_env, _owner, _repo, records, _githubTokenRef) => {
  return records
})

describe('Vector Service', () => {
  const mockVectorize = {
    insert: vi.fn(),
    deleteByIds: vi.fn(),
    query: vi.fn(),
    describe: vi.fn(),
    upsert: vi.fn(),
    getByIds: vi.fn()
  }
  const mockEnv = {
    ...env,
    VECTORIZE: mockVectorize
  }

  const mockCtx = createExecutionContext()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await mockEnv.DB.exec('DELETE FROM vectors');
    await mockEnv.DB.exec('DELETE FROM repo');
  })


  describe('saveVectors', async () => {
    it('should save vector IDs to D1 and vectors to VECTORIZE', async () => {
      // Setup test data
      const vectors: VectorizeVector[] = [{
        id: 'vec1',
        values: [1, 2, 3, 4],
        metadata: {
          oid: 'abc123',
          branch: 'main',
          owner: 'testOwner',
          repo: 'testRepo',
          path: '/test/path'
        }
      }]

      await mockEnv.DB.exec('INSERT INTO repo (id, name, owner) VALUES (123, "testRepo", "testOwner")')

      // Execute test
      await saveVectors(mockEnv, vectors)

      // Verify results
      const { results } = await mockEnv.DB.prepare('SELECT * from vectors').all()
      expect(results).toEqual([{
        id: 'vec1',
        embeddings: null,
        oid: 'abc123',
        branch: 'main',
        path: '/test/path',
        repo_id: 123
      }])
      expect(mockVectorize.insert).toHaveBeenCalledWith(vectors)
    })
  })

  describe('deleteVectors', () => {
    it('should delete vectors by ids', async () => {
      // Setup test data
      const records: RepoEntry[] = [{
        id: 1,
        repo_id: 123,
        oid: 'abc123',
        path: '/test/path',
        type: 'blob'
      }]

      await mockEnv.DB.exec('INSERT INTO repo (id, name, owner) VALUES (123, "testRepo", "testOwner")')
      await mockEnv.DB.exec(`INSERT INTO vectors (id, oid, branch, path, repo_id) VALUES ("vec1", "abc123", "main", "/test/path", 123)`)


      // Execute test
      await deleteVectors(mockEnv, mockCtx, records)

      // Verify results
      expect(mockVectorize.deleteByIds).toHaveBeenCalledWith(['vec1'])
    })
  })
})
