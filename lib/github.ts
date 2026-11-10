// Minimal GitHub REST/GraphQL calls for @Claude improvements and the admin actions. Plain
// fetch, no dependencies. Only server code calls these: the sandbox never gets a GitHub token.
import { REPO } from "../convex/lib/improve";

async function gh<T>(
  token: string,
  path: string,
  init: { method?: string; body?: unknown; accept?: string } = {},
): Promise<T> {
  const text = await ghText(token, path, init);
  return (text ? JSON.parse(text) : null) as T;
}

async function ghText(
  token: string,
  path: string,
  init: { method?: string; body?: unknown; accept?: string } = {},
): Promise<string> {
  const res = await fetch(`https://api.github.com${path}`, {
    method: init.method ?? "GET",
    headers: {
      authorization: `Bearer ${token}`,
      accept: init.accept ?? "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(
      `GitHub ${init.method ?? "GET"} ${path}: ${res.status} ${text.slice(0, 400)}`,
    );
  return text;
}

type PR = {
  number: number;
  title: string;
  html_url: string;
  state: string;
  merged: boolean;
  node_id: string;
};

export async function createPr(
  token: string,
  args: { branch: string; title: string; body: string },
) {
  return await gh<PR>(token, `/repos/${REPO}/pulls`, {
    method: "POST",
    body: {
      head: args.branch,
      base: "main",
      title: args.title,
      body: args.body,
    },
  });
}

export async function updatePr(
  token: string,
  number: number,
  args: { title?: string; body?: string },
) {
  return await gh<PR>(token, `/repos/${REPO}/pulls/${number}`, {
    method: "PATCH",
    body: args,
  });
}

export async function getPr(token: string, number: number) {
  return await gh<PR>(token, `/repos/${REPO}/pulls/${number}`);
}

export async function comment(token: string, number: number, body: string) {
  await gh(token, `/repos/${REPO}/issues/${number}/comments`, {
    method: "POST",
    body: { body },
  });
}

// Squash-merges and deletes the branch.
export async function mergePr(token: string, number: number, branch: string) {
  await gh(token, `/repos/${REPO}/pulls/${number}/merge`, {
    method: "PUT",
    body: { merge_method: "squash" },
  });
  await gh(token, `/repos/${REPO}/git/refs/heads/${branch}`, {
    method: "DELETE",
  }).catch(() => {}); // already gone is fine
}

export async function closePr(token: string, number: number, branch: string) {
  await gh(token, `/repos/${REPO}/pulls/${number}`, {
    method: "PATCH",
    body: { state: "closed" },
  });
  await gh(token, `/repos/${REPO}/git/refs/heads/${branch}`, {
    method: "DELETE",
  }).catch(() => {});
}

// Opens a PR that reverts a merged PR (GitHub's "Revert" button). Returns its URL.
export async function revertPr(token: string, number: number) {
  const pr = await getPr(token, number);
  const res = await gh<{
    data?: { revertPullRequest?: { revertPullRequest?: { url: string } } };
    errors?: { message: string }[];
  }>(token, "/graphql", {
    method: "POST",
    body: {
      query: `mutation($id: ID!) { revertPullRequest(input: { pullRequestId: $id }) { revertPullRequest { url } } }`,
      variables: { id: pr.node_id },
    },
  });
  const url = res.data?.revertPullRequest?.revertPullRequest?.url;
  if (!url) throw new Error(res.errors?.[0]?.message ?? "Revert failed");
  return url;
}

// --- Commits without git (lib/improve-finish.ts pushes the sandbox's changes this way) ---

export type FileChange =
  | { path: string; mode: "100644" | "100755"; content: Buffer }
  | { path: string; deleted: true };

// The commit a branch points at, or null if there's no such branch.
export async function branchHead(token: string, branch: string) {
  try {
    const ref = await gh<{ object: { sha: string } }>(
      token,
      `/repos/${REPO}/git/ref/heads/${branch}`,
    );
    return ref.object.sha;
  } catch (err) {
    if (String(err).includes(": 404 ")) return null;
    throw err;
  }
}

// Makes one commit on top of `parent` with `files` changed, and points `branch` at it
// (creating the branch if needed; never a force push). Returns the new commit's sha.
export async function commitFiles(
  token: string,
  args: {
    branch: string;
    parent: string;
    message: string;
    files: FileChange[];
  },
) {
  const parent = await gh<{ tree: { sha: string } }>(
    token,
    `/repos/${REPO}/git/commits/${args.parent}`,
  );
  const tree: {
    path: string;
    mode: string;
    type: "blob";
    sha: string | null;
  }[] = [];
  // A few blobs at a time, so a big change doesn't trip GitHub's rate limits.
  for (let i = 0; i < args.files.length; i += 8) {
    const batch = await Promise.all(
      args.files.slice(i, i + 8).map(async (f) => {
        if ("deleted" in f)
          return {
            path: f.path,
            mode: "100644",
            type: "blob" as const,
            sha: null,
          };
        const blob = await gh<{ sha: string }>(
          token,
          `/repos/${REPO}/git/blobs`,
          {
            method: "POST",
            body: { content: f.content.toString("base64"), encoding: "base64" },
          },
        );
        return {
          path: f.path,
          mode: f.mode,
          type: "blob" as const,
          sha: blob.sha,
        };
      }),
    );
    tree.push(...batch);
  }
  const newTree = await gh<{ sha: string }>(token, `/repos/${REPO}/git/trees`, {
    method: "POST",
    body: { base_tree: parent.tree.sha, tree },
  });
  const commit = await gh<{ sha: string }>(
    token,
    `/repos/${REPO}/git/commits`,
    {
      method: "POST",
      body: {
        message: args.message,
        tree: newTree.sha,
        parents: [args.parent],
        author: { name: "Claude", email: "noreply@anthropic.com" },
      },
    },
  );
  if (await branchHead(token, args.branch))
    await gh(token, `/repos/${REPO}/git/refs/heads/${args.branch}`, {
      method: "PATCH",
      body: { sha: commit.sha, force: false },
    });
  else
    await gh(token, `/repos/${REPO}/git/refs`, {
      method: "POST",
      body: { ref: `refs/heads/${args.branch}`, sha: commit.sha },
    });
  return commit.sha;
}

// What a branch changes compared with main (from where they split, like the PR page shows):
// the changed paths and the diff, both straight from GitHub.
export async function compareWithMain(token: string, branch: string) {
  const path = `/repos/${REPO}/compare/main...${branch}`;
  const [info, diff] = await Promise.all([
    gh<{ files?: { filename: string; previous_filename?: string }[] }>(
      token,
      path,
    ),
    ghText(token, path, { accept: "application/vnd.github.diff" }),
  ]);
  const files = new Set<string>();
  for (const f of info.files ?? []) {
    files.add(f.filename);
    if (f.previous_filename) files.add(f.previous_filename);
  }
  return { files: [...files], diff };
}
