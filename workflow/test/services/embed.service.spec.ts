import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as GithubSteps from '../../src/steps/github.step'
import { fetchTextFixture } from '../steps/fixtures/github.step.spec.fixture';
import { Result } from '../../src/types/github.graphql.types';
import { RepoEntry } from '../../src/types/types';
import { createEmbeddings, EMBEDDING_MODEL } from '../../src/services/embed.service';

const fixture = fetchTextFixture()

const mockFetchText = vi.fn(
  async (_owner: string, _repo: string, oidMap: { [key: string]: string }, _githubTokenRef: string) => fixture as Result
)

vi.spyOn(GithubSteps, 'fetchText').mockImplementation(mockFetchText)

// Mock Env
interface MockEnv {
  AI: {
    run: ReturnType<typeof vi.fn>;
  };
  github_semantic_search_bucket: {
    put: ReturnType<typeof vi.fn>;
  };
  VECTORIZE: {
    insert: ReturnType<typeof vi.fn>;
  };
}

describe('createEmbeddings', () => {
  let mockEnv: MockEnv;
  const mockRecords: RepoEntry[] = [
    { id: 1, repo_id: 1, oid: 'oid1', path: '/file1.txt', type: 'blob' },
    { id: 2, repo_id: 1, oid: 'oid2', path: '/dir/file2.txt', type: 'blob' },
  ];
  const owner = 'testOwner';
  const repo = 'testRepo';
  const githubTokenRef = 'encrypted-token-ref';

  beforeEach(() => {
    vi.clearAllMocks();

    mockEnv = {
      AI: {
        run: vi.fn().mockImplementation((_model, { text }: { text: string[] }) =>
          ({ data: text.map((_, i) => [(i / 10 + 0.1), (i / 10 + 0.2)]) })),
      },
      github_semantic_search_bucket: {
        put: vi.fn().mockResolvedValue(undefined),
      },
      VECTORIZE: {
        insert: vi.fn().mockResolvedValue(undefined),
      },
    };
  });

  it('should fetch text content for the given oids', async () => {
    await createEmbeddings(mockEnv as any, owner, repo, mockRecords, githubTokenRef);

    expect(mockFetchText).toHaveBeenCalledWith(owner, repo, { '1': 'oid1', '2': 'oid2' }, githubTokenRef);
  });

  it('should generate embeddings for the tokenized documents', async () => {
    await createEmbeddings(mockEnv as any, owner, repo, mockRecords, githubTokenRef);

    expect(mockEnv.AI.run).toHaveBeenCalledTimes(2);
    expect(mockEnv.AI.run).toHaveBeenNthCalledWith(1, EMBEDDING_MODEL, { text: [fixture.repository[2].text + '\n'] });
    expect(mockEnv.AI.run).toHaveBeenNthCalledWith(2, EMBEDDING_MODEL, { text: [fixture.repository[1].text + '\n'] });
  });

  it('should upload tokenized document text to R2', async () => {
    await createEmbeddings(mockEnv as any, owner, repo, mockRecords, githubTokenRef);

    expect(mockEnv.github_semantic_search_bucket.put).toHaveBeenCalledTimes(2);
    expect(mockEnv.github_semantic_search_bucket.put).toHaveBeenNthCalledWith(
      1, '/testOwner/testRepo/blob/HEAD/dir/file2.txt#L1-L36', fixture.repository[2].text + '\n');
    expect(mockEnv.github_semantic_search_bucket.put).toHaveBeenNthCalledWith(
      2, '/testOwner/testRepo/blob/HEAD/file1.txt#L1-L18', fixture.repository[1].text + '\n');
  });

  it('should insert embeddings into Vectorize with correct metadata', async () => {
    await createEmbeddings(mockEnv as any, owner, repo, mockRecords, githubTokenRef);

    expect(mockEnv.VECTORIZE.insert).toHaveBeenCalledTimes(2);
    const expectedVectors = [[
      {
        id: '/testOwner/testRepo/blob/HEAD/file1.txt#L1-L18',
        values: [0.1, 0.2],
        metadata: { oid: 'oid1', branch: 'HEAD', owner: 'testOwner', repo: 'testRepo', path: '/file1.txt' },
      },
    ], [
      {
        id: '/testOwner/testRepo/blob/HEAD/dir/file2.txt#L1-L36',
        values: [0.1, 0.2],
        metadata: { oid: 'oid2', branch: 'HEAD', owner: 'testOwner', repo: 'testRepo', path: '/dir/file2.txt' },
      },
    ]];
    expectedVectors.map(v => expect(mockEnv.VECTORIZE.insert).toHaveBeenCalledWith(v))
  });

  it('should return the original records', async () => {
    const result = await createEmbeddings(mockEnv as any, owner, repo, mockRecords, githubTokenRef);
    expect(result).toEqual(mockRecords);
  });
});
