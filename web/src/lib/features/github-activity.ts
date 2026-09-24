import { unstable_cache } from "next/cache";
import type { UserOctokit } from "@/lib/github/client";
import { repoTag } from "@/lib/github/cache-tags";
import { featureI18n } from "./i18n.ru";
import type { GithubActivity, GithubPullRequest } from "./types";

function matchesFeature(value: string, slug: string, storyIds: string[]): boolean {
  const lower = value.toLowerCase();
  if (lower.includes(slug.toLowerCase())) return true;
  return storyIds.some((storyId) => {
    const dashed = storyId.replace(".", "-");
    return new RegExp(`(?:^|[^0-9])(?:story[-_])?${dashed.replace("-", "[-_.]")}(?:$|[^0-9])`, "i").test(value);
  });
}

function parseRepository(value: string): { owner: string; repo: string } | null {
  const match = value.trim().match(/^([^/\s]+)\/([^/\s]+)$/);
  return match ? { owner: match[1], repo: match[2] } : null;
}

async function getRepositoryActivity(
  octokit: UserOctokit,
  repository: string,
  slug: string,
  storyIds: string[],
): Promise<GithubActivity> {
  const parsed = parseRepository(repository);
  if (!parsed) {
    return { access: "unavailable", matchingBranches: [], pullRequests: [], error: featureI18n.computed.github.invalidRepository(repository) };
  }
  try {
    const [branches, pullRequests] = await Promise.all([
      octokit.paginate(octokit.rest.repos.listBranches, { ...parsed, per_page: 100 }),
      octokit.paginate(octokit.rest.pulls.list, { ...parsed, state: "all", per_page: 100 }),
    ]);
    const matchingBranches = branches.filter((branch) => matchesFeature(branch.name, slug, storyIds)).map((branch) => branch.name);
    const matchingPullRequests: GithubPullRequest[] = pullRequests
      .filter((pullRequest) => matchesFeature(pullRequest.title, slug, storyIds) || matchesFeature(pullRequest.head.ref, slug, storyIds))
      .map((pullRequest) => ({
        number: pullRequest.number,
        title: pullRequest.title,
        state: pullRequest.state === "open" ? "open" : "closed",
        merged: Boolean(pullRequest.merged_at),
        base: pullRequest.base.ref,
      }));
    return { access: "available", matchingBranches, pullRequests: matchingPullRequests };
  } catch (error) {
    return {
      access: "unavailable",
      matchingBranches: [],
      pullRequests: [],
      error: error instanceof Error ? error.message : "GitHub API error",
    };
  }
}

/** Cached GitHub activity for one component repository. */
export function getCachedFeatureGithubActivity(
  octokit: UserOctokit,
  userId: string,
  repository: string,
  slug: string,
  storyIds: string[],
): Promise<GithubActivity> {
  const parsed = parseRepository(repository);
  if (!parsed) return Promise.resolve({ access: "unavailable", matchingBranches: [], pullRequests: [], error: featureI18n.computed.github.invalidRepository(repository) });
  const storyKey = storyIds.join(",");
  return unstable_cache(
    () => getRepositoryActivity(octokit, repository, slug, storyIds),
    ["feature-github-activity", userId, parsed.owner, parsed.repo, slug, storyKey],
    { revalidate: 300, tags: [repoTag(parsed.owner, parsed.repo)] },
  )();
}

export async function getGithubActivityForRepositories(
  octokit: UserOctokit | undefined,
  userId: string | undefined,
  repositories: string[],
  slug: string,
  storyIds: string[],
): Promise<GithubActivity> {
  if (!octokit || !userId) {
    return { access: "unavailable", matchingBranches: [], pullRequests: [], error: featureI18n.computed.github.unavailable };
  }
  if (repositories.length === 0) {
    return { access: "available", matchingBranches: [], pullRequests: [] };
  }
  const results = await Promise.all(repositories.map((repository) => getCachedFeatureGithubActivity(octokit, userId, repository, slug, storyIds)));
  const unavailable = results.find((result) => result.access === "unavailable");
  if (unavailable) return unavailable;
  return {
    access: "available",
    matchingBranches: results.flatMap((result) => result.matchingBranches),
    pullRequests: results.flatMap((result) => result.pullRequests),
  };
}
