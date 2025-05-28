import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'
import { env, createExecutionContext } from 'cloudflare:test'
import { updateVectors, saveVectors, deleteVectors, vectorToBlob, blobToVector } from '../../src/services/vector.service'
import { RepoEntry, Vector, VectorizeVector } from '../../src/types/types'
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

  describe('updateVectors', async () => {
    it('should update vectors and create embeddings for new records', async () => {
      // Setup test data
      const owner = 'testOwner'
      const repo = 'testRepo'
      const records: RepoEntry[] = [{
        id: 1,
        repo_id: 123,
        oid: 'abc123',
        path: '/test/path',
        type: 'blob'
      }, {
        id: 2,
        repo_id: 123,
        oid: 'abc1234',
        path: '/test/path2',
        type: 'blob'
      }]
      const githubTokenRef = 'token123'

      // Mock DB responses
      await mockEnv.DB.exec('INSERT INTO repo (id, name, owner) VALUES (123, "testRepo", "testOwner")')
      await mockEnv.DB.exec(`INSERT INTO vectors (id, embeddings, oid, branch, path, repo_id) VALUES ("vec1", "${vectorToBlob([1, 2, 3, 4])}", "abc123", "main", "/test/path", 123)`)


      // Execute test
      const result = await updateVectors(mockEnv, owner, repo, records, githubTokenRef)

      // Verify results
      expect(mockVectorize.insert).toHaveBeenCalled()
      expect(embedService.createEmbeddings).toHaveBeenCalledWith(mockEnv, owner, repo, [records[1]], githubTokenRef)
      expect(result).toEqual(records)
    })

    it('should not call createEmbeddings if no new records', async () => {
      // Setup test data
      const owner = 'testOwner'
      const repo = 'testRepo'
      const records: RepoEntry[] = [{
        id: 1,
        repo_id: 123,
        oid: 'abc123',
        path: '/test/path',
        type: 'blob'
      }]
      const githubTokenRef = 'token123'

      await mockEnv.DB.exec('INSERT INTO repo (id, name, owner) VALUES (123, "testRepo", "testOwner")')
      await mockEnv.DB.exec(`INSERT INTO vectors (id, embeddings, oid, branch, path, repo_id) VALUES ("vec1", "${vectorToBlob([1, 2, 3, 4])}", "abc123", "main", "/test/path", 123)`)


      // Execute test
      const result = await updateVectors(mockEnv, owner, repo, records, githubTokenRef)

      // Verify results
      expect(embedService.createEmbeddings).not.toHaveBeenCalled()
      expect(result).toEqual(records)
    })
  })

  describe('saveVectors', async () => {
    it('should save vectors to DB and VECTORIZE', async () => {
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
      const { results } = await mockEnv.DB.prepare('SELECT * from vectors').all<Vector>()
      expect(results).toEqual([{
        id: 'vec1',
        embeddings: await vectorToBlob([1, 2, 3, 4]),
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
      await mockEnv.DB.exec(`INSERT INTO vectors (id, embeddings, oid, branch, path, repo_id) VALUES ("vec1", "${vectorToBlob([1, 2, 3, 4])}", "abc123", "main", "/test/path", 123)`)


      // Execute test
      await deleteVectors(mockEnv, mockCtx, records)

      // Verify results
      expect(mockVectorize.deleteByIds).toHaveBeenCalledWith(['vec1'])
    })
  })
})
