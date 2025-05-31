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

    it('should handle empty vectors result from database', async () => {
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

      // Only insert repo, but no vectors
      await mockEnv.DB.exec('INSERT INTO repo (id, name, owner) VALUES (123, "testRepo", "testOwner")')

      // Execute test
      const result = await updateVectors(mockEnv, owner, repo, records, githubTokenRef)

      // Verify results
      expect(mockVectorize.insert).toHaveBeenCalledWith([])
      expect(embedService.createEmbeddings).toHaveBeenCalledWith(mockEnv, owner, repo, records, githubTokenRef)
      expect(result).toEqual(records)
    })

    it('should filter out records with matching oid+path combination', async () => {
      const owner = 'testOwner';
      const repo = 'testRepo';
      const records: RepoEntry[] = [
        { id: 1, repo_id: 123, oid: 'abc123', path: '/test/path1', type: 'blob' },  // Exists in DB
        { id: 2, repo_id: 123, oid: 'abc123', path: '/test/path2', type: 'blob' },  // Same oid, different path - should keep
        { id: 3, repo_id: 123, oid: 'abc124', path: '/test/path1', type: 'blob' },  // Different oid, same path - should keep
        { id: 4, repo_id: 123, oid: 'abc125', path: '/test/path4', type: 'blob' }   // Completely new - should keep
      ];
      const githubTokenRef = 'token123';

      // Insert repo and vector with oid='abc123' and path='/test/path1'
      await mockEnv.DB.exec('INSERT INTO repo (id, name, owner) VALUES (123, "testRepo", "testOwner")');
      await mockEnv.DB.exec(
        `INSERT INTO vectors (id, embeddings, oid, branch, path, repo_id) ` +
        `VALUES ("vec1", "${vectorToBlob([1, 2, 3, 4])}", "abc123", "main", "/test/path1", 123)`
      );

      await updateVectors(mockEnv, owner, repo, records, githubTokenRef);

      // Should call createEmbeddings with all records except the one with matching oid+path
      expect(embedService.createEmbeddings).toHaveBeenCalledWith(
        mockEnv,
        owner,
        repo,
        [records[1], records[2], records[3]], // All except records[0] which has matching oid+path
        githubTokenRef
      );
    });

    it('should correctly filter out existing records by oid or path', async () => {
      const owner = 'testOwner';
      const repo = 'testRepo';
      const records: RepoEntry[] = [
        { id: 1, repo_id: 123, oid: 'abc123', path: '/test/path1', type: 'blob' },
        { id: 2, repo_id: 123, oid: 'abc124', path: '/test/path1', type: 'blob' }, // Same path as existing
        { id: 3, repo_id: 123, oid: 'abc123', path: '/test/path3', type: 'blob' }, // Same oid as existing
        { id: 4, repo_id: 123, oid: 'abc125', path: '/test/path4', type: 'blob' }  // New record
      ];
      const githubTokenRef = 'token123';

      // Insert repo and one existing vector
      await mockEnv.DB.exec('INSERT INTO repo (id, name, owner) VALUES (123, "testRepo", "testOwner")');
      await mockEnv.DB.exec(
        `INSERT INTO vectors (id, embeddings, oid, branch, path, repo_id) ` +
        `VALUES ("vec1", "${vectorToBlob([1, 2, 3, 4])}", "abc123", "main", "/test/path1", 123) ` +
        `, ("vec2", "${vectorToBlob([1, 2, 3, 4])}", "abc124", "main", "/test/path1", 123) ` +
        `, ("vec3", "${vectorToBlob([1, 2, 3, 4])}", "abc123", "main", "/test/path3", 123) ` +
        `, ("vec4", "${vectorToBlob([1, 2, 3, 4])}", "abc125", "main", "/test/path4", 123) `
      );


      await updateVectors(mockEnv, owner, repo, records, githubTokenRef);

      // Should only call createEmbeddings with records that don't match existing oid or path
      expect(embedService.createEmbeddings).not.toHaveBeenCalled()
    });
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
