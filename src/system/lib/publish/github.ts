import 'server-only';

const GITHUB_API_BASE = 'https://api.github.com';

const MAX_ATTEMPTS = 3;

const RETRY_DELAY_MS = 4000;

export type FileWrite = {
  repoPath: string;
  content: string;
  encoding?: 'utf-8' | 'base64';
};

export type FileDelete = {
  repoPath: string;
  delete: true;
};

export type FileChange = FileWrite | FileDelete;

function getRepoConfig(): {
  owner: string;
  repo: string;
  token: string;
} {
  const owner = process.env.VERCEL_GIT_REPO_OWNER;
  const repo = process.env.VERCEL_GIT_REPO_SLUG;
  const token = process.env.GITHUB_TOKEN;
  if (!owner || !repo || !token) {
    throw new Error(
      'Missing environment variable(s) for GitHub publishing: VERCEL_GIT_REPO_OWNER, VERCEL_GIT_REPO_SLUG, GITHUB_TOKEN',
    );
  }

  return { owner, repo, token };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function githubRequest<T>(
  path: string,
  token: string,
  init?: {
    method?: string;
    body?: string;
  },
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await fetch(`${GITHUB_API_BASE}${path}`, {
        method: init?.method,
        body: init?.body,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw new Error(`GitHub API not reachable (${path}): ${String(error)}`);
    }
    if (response.ok) {
      return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
    }
    const isTransient = response.status >= 500 && response.status < 600;
    if (isTransient && attempt < MAX_ATTEMPTS) {
      lastError = new Error(`GitHub API ${response.status} at ${path}`);
      await sleep(RETRY_DELAY_MS);
      continue;
    }
    const body = await response.text();
    throw new Error(`GitHub API error ${response.status} at ${path}: ${body}`);
  }
  throw lastError instanceof Error ? lastError : new Error('GitHub-API: unbekannter Fehler');
}

export async function commitFiles(
  files: FileChange[],
  message: string,
): Promise<{
  commitSha: string;
}> {
  if (files.length === 0) {
    throw new Error('commitFiles: no files given.');
  }
  const { owner, repo, token } = getRepoConfig();
  const base = `/repos/${owner}/${repo}`;
  const ref = await githubRequest<{
    object: {
      sha: string;
    };
  }>(`${base}/git/ref/heads/main`, token);
  const latestCommitSha = ref.object.sha;
  const latestCommit = await githubRequest<{
    tree: {
      sha: string;
    };
  }>(`${base}/git/commits/${latestCommitSha}`, token);
  const treeEntries = await Promise.all(
    files.map(async (file) => {
      if ('delete' in file) {
        return { path: file.repoPath, mode: '100644' as const, type: 'blob' as const, sha: null };
      }
      const blob = await githubRequest<{
        sha: string;
      }>(`${base}/git/blobs`, token, {
        method: 'POST',
        body: JSON.stringify({ content: file.content, encoding: file.encoding ?? 'utf-8' }),
      });

      return { path: file.repoPath, mode: '100644' as const, type: 'blob' as const, sha: blob.sha };
    }),
  );
  const newTree = await githubRequest<{
    sha: string;
  }>(`${base}/git/trees`, token, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: latestCommit.tree.sha,
      tree: treeEntries,
    }),
  });
  const newCommit = await githubRequest<{
    sha: string;
  }>(`${base}/git/commits`, token, {
    method: 'POST',
    body: JSON.stringify({
      message,
      tree: newTree.sha,
      parents: [latestCommitSha],
    }),
  });
  await githubRequest<void>(`${base}/git/refs/heads/main`, token, {
    method: 'PATCH',
    body: JSON.stringify({ sha: newCommit.sha }),
  });

  return { commitSha: newCommit.sha };
}
